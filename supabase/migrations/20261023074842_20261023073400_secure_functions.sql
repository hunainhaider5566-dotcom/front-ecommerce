BEGIN;

CREATE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.has_role('admin'::public.app_role);
$$;
REVOKE ALL ON FUNCTION public.current_user_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;

CREATE FUNCTION public.get_public_availability(product_ids uuid[])
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

CREATE FUNCTION public.admin_dashboard_summary()
RETURNS TABLE (
  total_products bigint,
  published_products bigint,
  active_categories bigint,
  pending_orders bigint,
  open_orders bigint,
  paid_delivered_value numeric
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
  SELECT
    (SELECT pg_catalog.count(*) FROM public.products),
    (SELECT pg_catalog.count(*) FROM public.products WHERE publication_status = 'published'::public.publication_status),
    (SELECT pg_catalog.count(*) FROM public.categories WHERE is_active),
    (SELECT pg_catalog.count(*) FROM public.orders WHERE order_status = 'pending'::public.order_status),
    (SELECT pg_catalog.count(*) FROM public.orders WHERE order_status IN ('pending'::public.order_status, 'confirmed'::public.order_status, 'processing'::public.order_status)),
    COALESCE((
      SELECT pg_catalog.sum(total)
      FROM public.orders
      WHERE order_status = 'delivered'::public.order_status
        AND payment_status = 'paid'::public.payment_status
    ), 0)::numeric;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_dashboard_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_summary() TO authenticated;

CREATE FUNCTION private.enforce_order_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  transition_allowed boolean := false;
BEGIN
  IF NEW.order_status = OLD.order_status THEN
    RETURN NEW;
  END IF;

  transition_allowed := CASE OLD.order_status
    WHEN 'pending'::public.order_status THEN NEW.order_status IN ('confirmed'::public.order_status, 'cancelled'::public.order_status)
    WHEN 'confirmed'::public.order_status THEN NEW.order_status IN ('processing'::public.order_status, 'cancelled'::public.order_status)
    WHEN 'processing'::public.order_status THEN NEW.order_status IN ('shipped'::public.order_status, 'cancelled'::public.order_status)
    WHEN 'shipped'::public.order_status THEN NEW.order_status = 'delivered'::public.order_status
    ELSE false
  END;

  IF NOT transition_allowed THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid order status transition.';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_order_status_transition() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.audit_admin_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_id uuid;
  details_value jsonb := '{}'::jsonb;
  action_value text := TG_OP;
BEGIN
  IF TG_TABLE_NAME = 'orders' THEN
    IF TG_OP <> 'UPDATE' OR (OLD.order_status = NEW.order_status AND OLD.payment_status = NEW.payment_status) THEN
      RETURN NEW;
    END IF;
    target_id := NEW.id;
    details_value := pg_catalog.jsonb_build_object(
      'old_order_status', OLD.order_status,
      'new_order_status', NEW.order_status,
      'old_payment_status', OLD.payment_status,
      'new_payment_status', NEW.payment_status
    );
  ELSIF TG_TABLE_NAME = 'admin_order_notes' THEN
    target_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.order_id ELSE NEW.order_id END;
    details_value := pg_catalog.jsonb_build_object('note_record_id', CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END);
  ELSIF TG_TABLE_NAME = 'product_inventory' THEN
    target_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
    details_value := pg_catalog.jsonb_build_object(
      'product_id', CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END,
      'old_quantity', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.quantity END,
      'new_quantity', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.quantity END
    );
  ELSIF TG_TABLE_NAME = 'product_variants' THEN
    target_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
    details_value := pg_catalog.jsonb_build_object(
      'product_id', CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END,
      'option_label', CASE WHEN TG_OP = 'DELETE' THEN OLD.option_label ELSE NEW.option_label END,
      'option_value', CASE WHEN TG_OP = 'DELETE' THEN OLD.option_value ELSE NEW.option_value END
    );
  ELSIF TG_TABLE_NAME = 'products' THEN
    target_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
    details_value := pg_catalog.jsonb_build_object(
      'slug', CASE WHEN TG_OP = 'DELETE' THEN OLD.slug ELSE NEW.slug END,
      'category_id', CASE WHEN TG_OP = 'DELETE' THEN OLD.category_id ELSE NEW.category_id END,
      'publication_status', CASE WHEN TG_OP = 'DELETE' THEN OLD.publication_status ELSE NEW.publication_status END,
      'price', CASE WHEN TG_OP = 'DELETE' THEN OLD.price ELSE NEW.price END
    );
  ELSIF TG_TABLE_NAME = 'categories' THEN
    target_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
    details_value := pg_catalog.jsonb_build_object(
      'slug', CASE WHEN TG_OP = 'DELETE' THEN OLD.slug ELSE NEW.slug END,
      'is_active', CASE WHEN TG_OP = 'DELETE' THEN OLD.is_active ELSE NEW.is_active END
    );
  ELSE
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  INSERT INTO public.admin_audit_logs (actor_id, action, entity, entity_id, details)
  VALUES ((SELECT auth.uid()), action_value, TG_TABLE_NAME, target_id, details_value);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.audit_admin_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER orders_enforce_status_transition
  BEFORE UPDATE OF order_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.enforce_order_status_transition();
CREATE TRIGGER products_admin_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION private.audit_admin_change();
CREATE TRIGGER categories_admin_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION private.audit_admin_change();
CREATE TRIGGER variants_admin_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION private.audit_admin_change();
CREATE TRIGGER inventory_admin_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.product_inventory
  FOR EACH ROW EXECUTE FUNCTION private.audit_admin_change();
CREATE TRIGGER orders_admin_audit
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.audit_admin_change();
CREATE TRIGGER admin_order_notes_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.admin_order_notes
  FOR EACH ROW EXECUTE FUNCTION private.audit_admin_change();

CREATE FUNCTION public.create_order(
  p_customer_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_shipping_address jsonb,
  p_items jsonb,
  p_customer_email text DEFAULT NULL,
  p_delivery_fee numeric DEFAULT 0,
  p_payment_method public.payment_method DEFAULT 'unconfirmed',
  p_customer_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  line record;
  product_lock_id uuid;
  product_row public.products%ROWTYPE;
  variant_row public.product_variants%ROWTYPE;
  inventory_row public.product_inventory%ROWTYPE;
  item_product_id uuid;
  item_variant_id uuid;
  item_quantity integer;
  item_price numeric(12, 2);
  item_snapshot jsonb;
  subtotal_value numeric(16, 2) := 0;
  order_id_value uuid;
BEGIN
  IF p_customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users AS u WHERE u.id = p_customer_id) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Customer account was not found.';
  END IF;
  IF p_customer_name IS NULL OR char_length(btrim(p_customer_name)) NOT BETWEEN 1 AND 150 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A valid customer name is required.';
  END IF;
  IF p_customer_phone IS NULL OR char_length(btrim(p_customer_phone)) NOT BETWEEN 7 AND 32 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A valid customer phone number is required.';
  END IF;
  IF p_customer_email IS NOT NULL AND p_customer_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A valid customer email is required.';
  END IF;
  IF jsonb_typeof(p_shipping_address) <> 'object'
     OR NULLIF(btrim(p_shipping_address ->> 'address_line_1'), '') IS NULL
     OR NULLIF(btrim(p_shipping_address ->> 'city'), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A complete shipping address is required.';
  END IF;
  IF p_delivery_fee IS NULL OR p_delivery_fee < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Delivery fee must be non-negative.';
  END IF;
  IF p_payment_method IS NULL OR p_payment_method = 'unconfirmed'::public.payment_method THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A configured payment method is required.';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Between one and fifty order lines are required.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS input_line(product_id uuid, variant_id uuid, quantity integer)
    WHERE input_line.product_id IS NULL OR input_line.quantity IS NULL OR input_line.quantity NOT BETWEEN 1 AND 99
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Order lines require a product and a quantity between one and ninety-nine.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS input_line(product_id uuid, variant_id uuid, quantity integer)
    GROUP BY input_line.product_id, input_line.variant_id
    HAVING pg_catalog.count(*) > 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Duplicate order lines are not accepted.';
  END IF;

  FOR product_lock_id IN
    SELECT DISTINCT input_line.product_id
    FROM jsonb_to_recordset(p_items) AS input_line(product_id uuid, variant_id uuid, quantity integer)
    ORDER BY input_line.product_id
  LOOP
    PERFORM 1 FROM public.products AS p WHERE p.id = product_lock_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'An order product was not found.';
    END IF;
  END LOOP;

  FOR line IN
    SELECT * FROM jsonb_to_recordset(p_items) AS input_line(product_id uuid, variant_id uuid, quantity integer)
  LOOP
    item_product_id := line.product_id;
    item_variant_id := line.variant_id;
    item_quantity := line.quantity;

    SELECT * INTO product_row FROM public.products AS p WHERE p.id = item_product_id;
    IF product_row.publication_status <> 'published'::public.publication_status THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'An order product is no longer published.';
    END IF;
    IF product_row.currency <> 'PKR' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The product currency does not match the configured store currency.';
    END IF;

    IF item_variant_id IS NOT NULL THEN
      SELECT * INTO variant_row
      FROM public.product_variants AS v
      WHERE v.id = item_variant_id
        AND v.product_id = item_product_id
        AND v.is_active
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A selected product variant is unavailable.';
      END IF;
      item_price := COALESCE(variant_row.price_override, product_row.price);
      item_snapshot := pg_catalog.jsonb_build_object(
        'label', variant_row.option_label,
        'value', variant_row.option_value,
        'attributes', variant_row.attributes
      );
    ELSE
      IF EXISTS (
        SELECT 1 FROM public.product_variants AS v
        WHERE v.product_id = item_product_id AND v.is_active
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A product variant must be selected.';
      END IF;
      item_price := product_row.price;
      item_snapshot := '{}'::jsonb;
    END IF;

    IF product_row.track_inventory THEN
      SELECT * INTO inventory_row
      FROM public.product_inventory AS i
      WHERE i.product_id = item_product_id
        AND i.variant_id IS NOT DISTINCT FROM item_variant_id
      FOR UPDATE;
      IF NOT FOUND OR inventory_row.quantity < item_quantity THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Insufficient product availability.';
      END IF;
    END IF;

    subtotal_value := subtotal_value + (item_price * item_quantity);
  END LOOP;

  INSERT INTO public.orders (
    customer_id, customer_name, customer_phone, customer_email,
    shipping_address_snapshot, customer_note, currency, subtotal,
    delivery_fee, payment_method, payment_status, order_status
  ) VALUES (
    p_customer_id, btrim(p_customer_name), btrim(p_customer_phone), NULLIF(btrim(COALESCE(p_customer_email, '')), ''),
    p_shipping_address, NULLIF(btrim(COALESCE(p_customer_note, '')), ''), 'PKR',
    subtotal_value, p_delivery_fee, p_payment_method, 'pending'::public.payment_status, 'pending'::public.order_status
  ) RETURNING id INTO order_id_value;

  PERFORM pg_catalog.set_config('paperloom.inventory_movement_type', 'sale', true);
  PERFORM pg_catalog.set_config('paperloom.inventory_reference_id', order_id_value::text, true);

  FOR line IN
    SELECT * FROM jsonb_to_recordset(p_items) AS input_line(product_id uuid, variant_id uuid, quantity integer)
  LOOP
    item_product_id := line.product_id;
    item_variant_id := line.variant_id;
    item_quantity := line.quantity;

    SELECT * INTO product_row FROM public.products AS p WHERE p.id = item_product_id;
    IF item_variant_id IS NOT NULL THEN
      SELECT * INTO variant_row FROM public.product_variants AS v
      WHERE v.id = item_variant_id AND v.product_id = item_product_id AND v.is_active;
      item_price := COALESCE(variant_row.price_override, product_row.price);
      item_snapshot := pg_catalog.jsonb_build_object('label', variant_row.option_label, 'value', variant_row.option_value, 'attributes', variant_row.attributes);
    ELSE
      item_price := product_row.price;
      item_snapshot := '{}'::jsonb;
    END IF;

    INSERT INTO public.order_items (
      order_id, product_id, variant_id, product_name_snapshot, sku_snapshot,
      variant_snapshot, product_snapshot, quantity, unit_price
    ) VALUES (
      order_id_value, item_product_id, item_variant_id, product_row.name,
      COALESCE(variant_row.sku, product_row.sku), item_snapshot,
      pg_catalog.jsonb_build_object('slug', product_row.slug, 'short_description', product_row.short_description, 'currency', product_row.currency),
      item_quantity, item_price
    );

    IF product_row.track_inventory THEN
      UPDATE public.product_inventory AS i
      SET quantity = i.quantity - item_quantity
      WHERE i.product_id = item_product_id
        AND i.variant_id IS NOT DISTINCT FROM item_variant_id;
    END IF;

    variant_row := NULL;
  END LOOP;

  RETURN order_id_value;
END;
$$;
REVOKE ALL ON FUNCTION public.create_order(uuid, text, text, jsonb, jsonb, text, numeric, public.payment_method, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(uuid, text, text, jsonb, jsonb, text, numeric, public.payment_method, text) TO service_role;

COMMIT;
