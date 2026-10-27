-- Meridion Marketplace checkout and data-protection hardening.
-- This migration is additive and idempotent where PostgreSQL permits it.
-- It is the canonical source for checkout, public shop data, newsletter
-- subscriptions, admin/vendor product reads, and buyer complaint evidence.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Store settings (public read, admin RPC write)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_settings (
  id text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  store_name text NOT NULL DEFAULT 'Meridion Marketplace' CHECK (char_length(btrim(store_name)) BETWEEN 1 AND 160),
  support_email text CHECK (support_email IS NULL OR support_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  support_phone text,
  support_whatsapp text,
  delivery_fee numeric(12, 2) NOT NULL DEFAULT 250 CHECK (delivery_fee >= 0),
  cod_enabled boolean NOT NULL DEFAULT true,
  return_window_days integer NOT NULL DEFAULT 7 CHECK (return_window_days >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.store_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.store_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.store_settings TO anon, authenticated;
GRANT ALL ON TABLE public.store_settings TO service_role;

DROP POLICY IF EXISTS store_settings_public_read ON public.store_settings;
CREATE POLICY store_settings_public_read
  ON public.store_settings FOR SELECT TO anon, authenticated
  USING (true);

CREATE OR REPLACE FUNCTION private.touch_store_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.touch_store_settings_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS store_settings_touch_updated_at ON public.store_settings;
CREATE TRIGGER store_settings_touch_updated_at
  BEFORE UPDATE ON public.store_settings
  FOR EACH ROW EXECUTE FUNCTION private.touch_store_settings_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Newsletter subscribers (write only through a safe RPC)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  source text NOT NULL DEFAULT 'storefront' CHECK (char_length(source) <= 80),
  subscribed_at timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscribers_email_unique_idx
  ON public.newsletter_subscribers (lower(email));

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.newsletter_subscribers FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.newsletter_subscribers TO service_role;

CREATE OR REPLACE FUNCTION public.subscribe_newsletter(
  p_email text,
  p_source text DEFAULT 'storefront'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  clean_email text;
  clean_source text;
BEGIN
  clean_email := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_email, '')));
  clean_source := pg_catalog.left(COALESCE(NULLIF(pg_catalog.btrim(p_source), ''), 'storefront'), 80);

  IF clean_email = '' OR clean_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter a valid email address.';
  END IF;
  IF pg_catalog.char_length(clean_email) > 254 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'That email address is too long.';
  END IF;

  INSERT INTO public.newsletter_subscribers (email, source)
  VALUES (clean_email, clean_source)
  ON CONFLICT DO NOTHING;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.subscribe_newsletter(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscribe_newsletter(text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Seller application verification fields
-- ---------------------------------------------------------------------------
ALTER TABLE public.seller_profiles
  ADD COLUMN IF NOT EXISTS phone text CHECK (phone IS NULL OR char_length(btrim(phone)) BETWEEN 7 AND 32),
  ADD COLUMN IF NOT EXISTS document_path text CHECK (
    document_path IS NULL
    OR (document_path !~ '^/' AND document_path !~ '(^|/)\.\.?(/|$)')
  );

GRANT INSERT (user_id, shop_name, slug, description, contact_email, phone, document_path)
  ON TABLE public.seller_profiles TO authenticated;
GRANT UPDATE (shop_name, slug, description, contact_email, phone, document_path)
  ON TABLE public.seller_profiles TO authenticated;

-- Pending and rejected sellers must be able to correct their own shop details
-- before review. Status, review notes and reviewer identity remain protected by
-- column privileges and are only changed by admin or the resubmit RPC below.
DROP POLICY IF EXISTS seller_profiles_own_profile_update ON public.seller_profiles;
CREATE POLICY seller_profiles_own_profile_update
  ON public.seller_profiles FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND status IN ('pending', 'approved', 'rejected'))
  WITH CHECK (user_id = (SELECT auth.uid()) AND status IN ('pending', 'approved', 'rejected'));

CREATE OR REPLACE FUNCTION public.seller_resubmit_application()
RETURNS public.seller_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  resubmitted public.seller_profiles%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sign in before resubmitting a seller application.';
  END IF;

  UPDATE public.seller_profiles AS s
  SET status = 'pending',
      rejection_reason = NULL,
      reviewed_by = NULL,
      reviewed_at = NULL,
      updated_at = now()
  WHERE s.user_id = (SELECT auth.uid())
    AND s.status = 'rejected'
  RETURNING * INTO resubmitted;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Only a rejected seller application can be resubmitted.';
  END IF;

  RETURN resubmitted;
END;
$$;
REVOKE ALL ON FUNCTION public.seller_resubmit_application() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seller_resubmit_application() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Order idempotency and buyer-safe checkout RPC
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS idempotency_key text CHECK (
    idempotency_key IS NULL OR char_length(idempotency_key) BETWEEN 8 AND 120
  );

CREATE UNIQUE INDEX IF NOT EXISTS orders_customer_idempotency_unique_idx
  ON public.orders (customer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.place_order(
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_shipping_address jsonb,
  p_items jsonb,
  p_idempotency_key text,
  p_customer_note text DEFAULT NULL,
  p_delivery_lat numeric DEFAULT NULL,
  p_delivery_lng numeric DEFAULT NULL,
  p_delivery_location_name text DEFAULT NULL,
  p_delivery_location_captured_at timestamptz DEFAULT NULL
)
RETURNS TABLE (
  order_id uuid,
  order_number text,
  subtotal numeric,
  delivery_fee numeric,
  total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  line record;
  product_lock_id uuid;
  product_row public.products%ROWTYPE;
  seller_row public.seller_profiles%ROWTYPE;
  inventory_row public.product_inventory%ROWTYPE;
  v_buyer_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_item_quantity integer;
  v_item_price numeric(12, 2);
  v_variant_sku text;
  v_variant_snapshot jsonb;
  v_subtotal numeric(16, 2) := 0;
  v_delivery_fee numeric(16, 2) := 250;
  v_cod_enabled boolean := true;
  v_seller record;
BEGIN
  v_buyer_id := (SELECT auth.uid());
  IF v_buyer_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sign in before placing an order.';
  END IF;

  IF p_customer_name IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_customer_name)) NOT BETWEEN 1 AND 150 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A valid customer name is required.';
  END IF;
  IF p_customer_phone IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_customer_phone)) NOT BETWEEN 7 AND 32 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A valid customer phone number is required.';
  END IF;
  IF p_customer_email IS NOT NULL AND pg_catalog.btrim(p_customer_email) <> ''
     AND p_customer_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A valid customer email is required.';
  END IF;
  IF p_shipping_address IS NULL OR pg_catalog.jsonb_typeof(p_shipping_address) <> 'object'
     OR NULLIF(pg_catalog.btrim(p_shipping_address ->> 'address_line_1'), '') IS NULL
     OR NULLIF(pg_catalog.btrim(p_shipping_address ->> 'city'), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A complete shipping address is required.';
  END IF;
  IF pg_catalog.octet_length(p_shipping_address::text) > 20000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The shipping address is too long.';
  END IF;
  IF p_idempotency_key IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 8 AND 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A valid checkout key is required.';
  END IF;
  IF p_items IS NULL OR pg_catalog.jsonb_typeof(p_items) <> 'array'
     OR pg_catalog.jsonb_array_length(p_items) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Between one and fifty order lines are required.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_to_recordset(p_items) AS input_line(product_id uuid, variant_id uuid, quantity integer)
    WHERE input_line.product_id IS NULL
       OR input_line.quantity IS NULL
       OR input_line.quantity NOT BETWEEN 1 AND 99
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Order lines require a product and a quantity between one and ninety-nine.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_to_recordset(p_items) AS input_line(product_id uuid, variant_id uuid, quantity integer)
    GROUP BY input_line.product_id, input_line.variant_id
    HAVING pg_catalog.count(*) > 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Duplicate order lines are not accepted.';
  END IF;

  -- Serialize repeated submissions for the same buyer and checkout key.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_buyer_id::text || ':' || pg_catalog.btrim(p_idempotency_key), 0)
  );

  SELECT o.id INTO v_order_id
  FROM public.orders AS o
  WHERE o.customer_id = v_buyer_id
    AND o.idempotency_key = pg_catalog.btrim(p_idempotency_key);

  IF v_order_id IS NOT NULL THEN
    RETURN QUERY
    SELECT o.id, o.order_number, o.subtotal, o.delivery_fee, o.total
    FROM public.orders AS o
    WHERE o.id = v_order_id;
    RETURN;
  END IF;

  SELECT s.delivery_fee, s.cod_enabled
  INTO v_delivery_fee, v_cod_enabled
  FROM public.store_settings AS s
  WHERE s.id = 'default';

  IF NOT FOUND THEN
    v_delivery_fee := 250;
    v_cod_enabled := true;
  END IF;
  IF NOT v_cod_enabled THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Cash on delivery is currently unavailable.';
  END IF;

  FOR product_lock_id IN
    SELECT DISTINCT input_line.product_id
    FROM pg_catalog.jsonb_to_recordset(p_items) AS input_line(product_id uuid, variant_id uuid, quantity integer)
    ORDER BY input_line.product_id
  LOOP
    PERFORM 1 FROM public.products AS p WHERE p.id = product_lock_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'An order product was not found.';
    END IF;
  END LOOP;

  FOR line IN
    SELECT *
    FROM pg_catalog.jsonb_to_recordset(p_items) AS input_line(product_id uuid, variant_id uuid, quantity integer)
  LOOP
    SELECT * INTO product_row FROM public.products AS p WHERE p.id = line.product_id;

    IF product_row.publication_status <> 'published'::public.publication_status THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'An order product is no longer published.';
    END IF;
    IF product_row.moderation_status <> 'approved' OR product_row.stock_verification_status = 'paused' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'An order product is not currently available.';
    END IF;
    IF product_row.currency <> 'PKR' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The product currency does not match the store currency.';
    END IF;

    IF product_row.seller_id IS NOT NULL THEN
      SELECT * INTO seller_row FROM public.seller_profiles AS s WHERE s.id = product_row.seller_id;
      IF NOT FOUND OR seller_row.status <> 'approved' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'An order product seller is not currently approved.';
      END IF;
    END IF;

    IF line.variant_id IS NOT NULL THEN
      PERFORM 1 FROM public.product_variants AS v
      WHERE v.id = line.variant_id AND v.product_id = product_row.id AND v.is_active
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A selected product variant is unavailable.';
      END IF;
      v_item_price := NULL;
      v_variant_snapshot := NULL;
      v_variant_sku := NULL;
      SELECT COALESCE(v.price_override, product_row.price),
             pg_catalog.jsonb_build_object('label', v.option_label, 'value', v.option_value, 'attributes', v.attributes),
             v.sku
      INTO v_item_price, v_variant_snapshot, v_variant_sku
      FROM public.product_variants AS v
      WHERE v.id = line.variant_id AND v.product_id = product_row.id AND v.is_active;
      IF v_item_price IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A selected product variant is unavailable.';
      END IF;
    ELSE
      IF EXISTS (
        SELECT 1 FROM public.product_variants AS v
        WHERE v.product_id = product_row.id AND v.is_active
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A product variant must be selected.';
      END IF;
      v_item_price := product_row.price;
      v_variant_snapshot := '{}'::jsonb;
      v_variant_sku := NULL;
    END IF;

    v_item_quantity := line.quantity;

    IF product_row.track_inventory THEN
      SELECT * INTO inventory_row
      FROM public.product_inventory AS i
      WHERE i.product_id = product_row.id
        AND i.variant_id IS NOT DISTINCT FROM line.variant_id
      FOR UPDATE;
      IF NOT FOUND OR inventory_row.quantity < v_item_quantity THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Insufficient product availability.';
      END IF;
    END IF;

    v_subtotal := v_subtotal + (v_item_price * v_item_quantity);
  END LOOP;

  INSERT INTO public.orders (
    customer_id, customer_name, customer_phone, customer_email,
    shipping_address_snapshot, customer_note, currency, subtotal,
    delivery_fee, payment_method, payment_status, order_status,
    delivery_lat, delivery_lng, delivery_location_name, delivery_location_captured_at,
    idempotency_key
  ) VALUES (
    v_buyer_id,
    pg_catalog.btrim(p_customer_name),
    pg_catalog.btrim(p_customer_phone),
    NULLIF(pg_catalog.btrim(COALESCE(p_customer_email, '')), ''),
    p_shipping_address,
    NULLIF(pg_catalog.btrim(COALESCE(p_customer_note, '')), ''),
    'PKR',
    v_subtotal,
    v_delivery_fee,
    'cod'::public.payment_method,
    'pending'::public.payment_status,
    'pending'::public.order_status,
    p_delivery_lat,
    p_delivery_lng,
    NULLIF(pg_catalog.btrim(COALESCE(p_delivery_location_name, '')), ''),
    p_delivery_location_captured_at,
    pg_catalog.btrim(p_idempotency_key)
  )
  RETURNING id, orders.order_number INTO v_order_id, v_order_number;

  PERFORM pg_catalog.set_config('paperloom.inventory_movement_type', 'sale', true);
  PERFORM pg_catalog.set_config('paperloom.inventory_reference_id', v_order_id::text, true);

  FOR line IN
    SELECT *
    FROM pg_catalog.jsonb_to_recordset(p_items) AS input_line(product_id uuid, variant_id uuid, quantity integer)
  LOOP
    SELECT * INTO product_row FROM public.products AS p WHERE p.id = line.product_id;

    IF line.variant_id IS NOT NULL THEN
      SELECT COALESCE(v.price_override, product_row.price),
             pg_catalog.jsonb_build_object('label', v.option_label, 'value', v.option_value, 'attributes', v.attributes),
             v.sku
      INTO v_item_price, v_variant_snapshot, v_variant_sku
      FROM public.product_variants AS v
      WHERE v.id = line.variant_id AND v.product_id = product_row.id AND v.is_active;
    ELSE
      v_item_price := product_row.price;
      v_variant_snapshot := '{}'::jsonb;
      v_variant_sku := NULL;
    END IF;

    INSERT INTO public.order_items (
      order_id, product_id, variant_id, seller_id, seller_name_snapshot,
      product_name_snapshot, sku_snapshot, variant_snapshot, product_snapshot,
      quantity, unit_price
    ) VALUES (
      v_order_id,
      product_row.id,
      line.variant_id,
      product_row.seller_id,
      (SELECT s.shop_name FROM public.seller_profiles AS s WHERE s.id = product_row.seller_id),
      product_row.name,
      COALESCE(v_variant_sku, product_row.sku),
      v_variant_snapshot,
      pg_catalog.jsonb_build_object(
        'slug', product_row.slug,
        'short_description', product_row.short_description,
        'currency', product_row.currency
      ),
      line.quantity,
      v_item_price
    );

    IF product_row.track_inventory THEN
      UPDATE public.product_inventory AS i
      SET quantity = i.quantity - line.quantity
      WHERE i.product_id = product_row.id
        AND i.variant_id IS NOT DISTINCT FROM line.variant_id;
    END IF;
  END LOOP;

  INSERT INTO public.notifications (user_id, kind, title, body, related_order_id)
  VALUES (
    v_buyer_id,
    'order',
    'Order ' || v_order_number || ' received',
    'We received your cash-on-delivery order. Track its status from your account.',
    v_order_id
  );

  FOR v_seller IN
    SELECT DISTINCT s.user_id, s.shop_name
    FROM public.order_items AS oi
    JOIN public.seller_profiles AS s ON s.id = oi.seller_id
    WHERE oi.order_id = v_order_id
  LOOP
    INSERT INTO public.notifications (user_id, kind, title, body, related_order_id)
    VALUES (
      v_seller.user_id,
      'order',
      'New order for ' || v_seller.shop_name,
      'A buyer placed order ' || v_order_number || '. Review the items in your seller dashboard.',
      v_order_id
    );
  END LOOP;

  RETURN QUERY
  SELECT v_order_id, v_order_number, v_subtotal, v_delivery_fee, (v_subtotal + v_delivery_fee);
END;
$$;

REVOKE ALL ON FUNCTION public.place_order(text, text, text, jsonb, jsonb, text, text, numeric, numeric, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_order(text, text, text, jsonb, jsonb, text, text, numeric, numeric, text, timestamptz) TO authenticated;

-- Notify buyers whenever an authorized operator changes order status.
CREATE OR REPLACE FUNCTION private.notify_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL AND OLD.order_status IS DISTINCT FROM NEW.order_status THEN
    INSERT INTO public.notifications (user_id, kind, title, body, related_order_id)
    VALUES (
      NEW.customer_id,
      'order',
      'Order ' || NEW.order_number || ' updated',
      'Your order status is now ' || NEW.order_status::text || '.',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.notify_order_status_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_notify_status_change ON public.orders;
CREATE TRIGGER orders_notify_status_change
  AFTER UPDATE OF order_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.notify_order_status_change();

-- Keep the seller fulfilment RPC but notify the buyer on each transition.
CREATE OR REPLACE FUNCTION public.vendor_update_order_item(
  p_item_id uuid,
  p_status text,
  p_tracking_number text DEFAULT NULL,
  p_tracking_url text DEFAULT NULL,
  p_vendor_note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_status text;
  v_order_id uuid;
BEGIN
  SELECT oi.vendor_fulfillment_status, oi.order_id
  INTO current_status, v_order_id
  FROM public.order_items AS oi
  WHERE oi.id = p_item_id
    AND oi.seller_id IN (
      SELECT s.id FROM public.seller_profiles AS s
      WHERE s.user_id = (SELECT auth.uid()) AND s.status = 'approved'
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Order item access was denied.';
  END IF;
  IF p_status NOT IN ('pending', 'accepted', 'processing', 'shipped', 'delivered', 'cancelled')
     OR (current_status = 'pending' AND p_status NOT IN ('accepted', 'cancelled'))
     OR (current_status = 'accepted' AND p_status NOT IN ('processing', 'cancelled'))
     OR (current_status = 'processing' AND p_status NOT IN ('shipped', 'cancelled'))
     OR (current_status = 'shipped' AND p_status <> 'delivered')
     OR current_status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid vendor fulfilment transition.';
  END IF;

  UPDATE public.order_items
  SET vendor_fulfillment_status = p_status,
      tracking_number = NULLIF(p_tracking_number, ''),
      tracking_url = NULLIF(p_tracking_url, ''),
      vendor_note = NULLIF(p_vendor_note, ''),
      vendor_updated_at = now()
  WHERE id = p_item_id;

  INSERT INTO public.notifications (user_id, kind, title, body, related_order_id)
  SELECT o.customer_id, 'order', 'Order ' || o.order_number || ' fulfilment updated',
         'A seller updated an item to ' || p_status || '.', o.id
  FROM public.orders AS o
  WHERE o.id = v_order_id AND o.customer_id IS NOT NULL;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.vendor_update_order_item(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_update_order_item(uuid, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Public shop directory without exposing seller_profiles
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_public_shops()
RETURNS TABLE (
  id uuid,
  shop_name text,
  slug text,
  description text,
  created_at timestamptz,
  product_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.id, s.shop_name, s.slug, s.description, s.created_at,
         (SELECT pg_catalog.count(*)
          FROM public.products AS p
          WHERE p.seller_id = s.id
            AND p.publication_status = 'published'::public.publication_status
            AND p.moderation_status = 'approved'
            AND p.stock_verification_status <> 'paused')
  FROM public.seller_profiles AS s
  WHERE s.status = 'approved'
  ORDER BY s.shop_name;
$$;
REVOKE ALL ON FUNCTION public.list_public_shops() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_shops() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Admin and vendor product reads that include private cost columns
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_products(p_search text DEFAULT '')
RETURNS SETOF public.products
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  term text := NULLIF(pg_catalog.btrim(COALESCE(p_search, '')), '');
BEGIN
  IF NOT private.has_role('admin'::public.app_role) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Administrator access is required.';
  END IF;

  RETURN QUERY
  SELECT p.*
  FROM public.products AS p
  WHERE term IS NULL
     OR p.name ILIKE '%' || term || '%'
     OR p.sku ILIKE '%' || term || '%'
     OR p.slug ILIKE '%' || term || '%'
  ORDER BY p.created_at DESC
  LIMIT 200;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_products(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_products(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.vendor_list_products()
RETURNS SETOF public.products
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  seller_id_value uuid;
BEGIN
  SELECT s.id INTO seller_id_value
  FROM public.seller_profiles AS s
  WHERE s.user_id = (SELECT auth.uid()) AND s.status = 'approved';

  IF seller_id_value IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'An approved seller account is required.';
  END IF;

  RETURN QUERY
  SELECT p.*
  FROM public.products AS p
  WHERE p.seller_id = seller_id_value
  ORDER BY p.created_at DESC
  LIMIT 200;
END;
$$;
REVOKE ALL ON FUNCTION public.vendor_list_products() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_list_products() TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Admin customer summary (includes auth email only for admins)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_customer_summary()
RETURNS TABLE (
  id uuid,
  full_name text,
  phone text,
  avatar_url text,
  email text,
  order_count bigint,
  lifetime_value numeric,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.has_role('admin'::public.app_role) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Administrator access is required.';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.phone, p.avatar_url, u.email,
         COALESCE((SELECT pg_catalog.count(*) FROM public.orders AS o WHERE o.customer_id = p.id), 0),
         COALESCE((SELECT pg_catalog.sum(o.total) FROM public.orders AS o WHERE o.customer_id = p.id
                   AND o.order_status = 'delivered'::public.order_status
                   AND o.payment_status = 'paid'::public.payment_status), 0)::numeric,
         p.created_at, p.updated_at
  FROM public.profiles AS p
  JOIN auth.users AS u ON u.id = p.id
  ORDER BY p.created_at DESC
  LIMIT 500;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_customer_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_customer_summary() TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Safe store settings update for administrators
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_store_settings(p_settings jsonb)
RETURNS public.store_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result_row public.store_settings;
BEGIN
  IF NOT private.has_role('admin'::public.app_role) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Administrator access is required.';
  END IF;
  IF p_settings IS NULL OR pg_catalog.jsonb_typeof(p_settings) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Store settings must be an object.';
  END IF;

  UPDATE public.store_settings AS s
  SET store_name = COALESCE(NULLIF(pg_catalog.btrim(p_settings ->> 'store_name'), ''), s.store_name),
      support_email = CASE WHEN p_settings ? 'support_email' THEN NULLIF(pg_catalog.btrim(p_settings ->> 'support_email'), '') ELSE s.support_email END,
      support_phone = CASE WHEN p_settings ? 'support_phone' THEN NULLIF(pg_catalog.btrim(p_settings ->> 'support_phone'), '') ELSE s.support_phone END,
      support_whatsapp = CASE WHEN p_settings ? 'support_whatsapp' THEN NULLIF(pg_catalog.btrim(p_settings ->> 'support_whatsapp'), '') ELSE s.support_whatsapp END,
      delivery_fee = CASE WHEN p_settings ? 'delivery_fee' THEN (p_settings ->> 'delivery_fee')::numeric ELSE s.delivery_fee END,
      cod_enabled = CASE WHEN p_settings ? 'cod_enabled' THEN (p_settings ->> 'cod_enabled')::boolean ELSE s.cod_enabled END,
      return_window_days = CASE WHEN p_settings ? 'return_window_days' THEN (p_settings ->> 'return_window_days')::integer ELSE s.return_window_days END
  WHERE s.id = 'default'
  RETURNING * INTO result_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Store settings were not found.';
  END IF;
  RETURN result_row;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_store_settings(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_store_settings(jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. Harden public availability and hide supplier costs at column level
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_availability(product_ids uuid[])
RETURNS TABLE (product_id uuid, variant_id uuid, is_available boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(pg_catalog.cardinality(product_ids), 0) > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'At most 100 product IDs may be requested.';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    v.id,
    CASE
      WHEN NOT p.track_inventory THEN true
      ELSE COALESCE(i.quantity > 0, false)
    END
  FROM public.products AS p
  LEFT JOIN public.product_variants AS v
    ON v.product_id = p.id
   AND v.is_active
  LEFT JOIN public.product_inventory AS i
    ON i.product_id = p.id
   AND i.variant_id IS NOT DISTINCT FROM v.id
  WHERE p.publication_status = 'published'::public.publication_status
    AND p.moderation_status = 'approved'
    AND p.stock_verification_status <> 'paused'
    AND p.id = ANY(COALESCE(product_ids, ARRAY[]::uuid[]))
    AND (
      v.id IS NOT NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.product_variants AS active_variant
        WHERE active_variant.product_id = p.id AND active_variant.is_active
      )
    );
END;
$$;
REVOKE ALL ON FUNCTION public.get_public_availability(uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_availability(uuid[]) TO anon, authenticated;

REVOKE SELECT ON TABLE public.products FROM anon, authenticated;
GRANT SELECT (
  id, category_id, seller_id, name, slug, sku, short_description, description,
  price, currency, specifications, publication_status, moderation_status,
  stock_verification_status, is_featured, track_inventory, weight_grams,
  dimensions, seo_title, seo_description, created_at, updated_at
) ON TABLE public.products TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.products TO service_role;

-- The base storefront migration created these tables without table grants.
-- RLS already limits reads to published rows and writes to admins/vendors.
GRANT SELECT ON TABLE public.homepage_heroes, public.promotions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.homepage_heroes, public.promotions TO authenticated;
GRANT ALL ON TABLE public.homepage_heroes, public.promotions TO service_role;

-- ---------------------------------------------------------------------------
-- 10. Storage buckets and least-privilege policies
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images', 'product-images', true, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vendor-documents', 'vendor-documents', false, 10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'complaint-evidence', 'complaint-evidence', false, 10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS product_images_storage_admin_read ON storage.objects;
CREATE POLICY product_images_storage_admin_read
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'product-images' AND (SELECT private.has_role('admin'::public.app_role)));

DROP POLICY IF EXISTS product_images_storage_admin_insert ON storage.objects;
CREATE POLICY product_images_storage_admin_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND (SELECT private.has_role('admin'::public.app_role)));

DROP POLICY IF EXISTS product_images_storage_admin_update ON storage.objects;
CREATE POLICY product_images_storage_admin_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND (SELECT private.has_role('admin'::public.app_role)))
  WITH CHECK (bucket_id = 'product-images' AND (SELECT private.has_role('admin'::public.app_role)));

DROP POLICY IF EXISTS product_images_storage_admin_delete ON storage.objects;
CREATE POLICY product_images_storage_admin_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND (SELECT private.has_role('admin'::public.app_role)));

DROP POLICY IF EXISTS "Vendor document upload" ON storage.objects;
DROP POLICY IF EXISTS vendor_documents_owner_insert ON storage.objects;
CREATE POLICY vendor_documents_owner_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vendor-documents'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "Vendor document owner or admin read" ON storage.objects;
DROP POLICY IF EXISTS vendor_documents_owner_or_admin_read ON storage.objects;
CREATE POLICY vendor_documents_owner_or_admin_read
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'vendor-documents'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR (SELECT private.has_role('admin'::public.app_role))
    )
  );

DROP POLICY IF EXISTS vendor_documents_owner_update ON storage.objects;
CREATE POLICY vendor_documents_owner_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'vendor-documents'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'vendor-documents'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS vendor_documents_owner_or_admin_delete ON storage.objects;
CREATE POLICY vendor_documents_owner_or_admin_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'vendor-documents'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR (SELECT private.has_role('admin'::public.app_role))
    )
  );

DROP POLICY IF EXISTS "Complaint evidence upload" ON storage.objects;
DROP POLICY IF EXISTS complaint_evidence_owner_insert ON storage.objects;
CREATE POLICY complaint_evidence_owner_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'complaint-evidence'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "Complaint evidence read" ON storage.objects;
DROP POLICY IF EXISTS complaint_evidence_buyer_or_admin_read ON storage.objects;
CREATE POLICY complaint_evidence_buyer_or_admin_read
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'complaint-evidence'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR (SELECT private.has_role('admin'::public.app_role))
    )
  );

DROP POLICY IF EXISTS complaint_evidence_seller_read ON storage.objects;
CREATE POLICY complaint_evidence_seller_read
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'complaint-evidence'
    AND EXISTS (
      SELECT 1
      FROM public.marketplace_cases AS c
      JOIN public.seller_profiles AS s ON s.id = c.seller_id
      WHERE c.evidence_path = storage.objects.name
        AND s.user_id = (SELECT auth.uid())
        AND s.status = 'approved'
    )
  );

DROP POLICY IF EXISTS complaint_evidence_owner_or_admin_delete ON storage.objects;
CREATE POLICY complaint_evidence_owner_or_admin_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'complaint-evidence'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR (SELECT private.has_role('admin'::public.app_role))
    )
  );

COMMIT;
