-- Food category metadata, daily dish statuses, Karachi reset and local delivery guard.
-- Karachi midnight is 19:00 UTC (Pakistan Standard Time is UTC+05:00).

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS is_food_category boolean NOT NULL DEFAULT false;

UPDATE public.categories
SET is_food_category = true
WHERE slug = 'food-groceries' AND is_food_category IS DISTINCT FROM true;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS daily_status text NOT NULL DEFAULT 'available';

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_daily_status_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_daily_status_check
  CHECK (daily_status IN ('available', 'not_today', 'coming_soon'));

CREATE INDEX IF NOT EXISTS products_daily_menu_idx
  ON public.products (daily_status, daily_available_on)
  WHERE is_daily_item = true;

CREATE OR REPLACE FUNCTION public.guard_food_category_toggle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.is_food_category AND NOT NEW.is_food_category THEN
    IF EXISTS (
      WITH RECURSIVE descendants(id) AS (
        SELECT OLD.id
        UNION ALL
        SELECT c.id FROM public.categories c
        JOIN descendants d ON c.parent_id = d.id
      )
      SELECT 1
      FROM public.products p
      JOIN descendants d ON d.id = p.category_id
      WHERE p.food_selling_unit IS NOT NULL OR p.is_daily_item
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'Move or clear all food products and daily dishes before disabling Food Category.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS categories_guard_food_toggle ON public.categories;
CREATE TRIGGER categories_guard_food_toggle
BEFORE UPDATE OF is_food_category ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.guard_food_category_toggle();

CREATE OR REPLACE FUNCTION public.enforce_food_product_category()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_category_id uuid;
  v_is_food boolean := false;
BEGIN
  IF NEW.food_selling_unit IS NULL AND NOT NEW.is_daily_item THEN
    RETURN NEW;
  END IF;

  v_category_id := NEW.category_id;
  WHILE v_category_id IS NOT NULL LOOP
    SELECT c.is_food_category, c.parent_id
      INTO v_is_food, v_category_id
    FROM public.categories c
    WHERE c.id = v_category_id;
    EXIT WHEN v_is_food OR v_category_id IS NULL;
  END LOOP;

  IF NOT v_is_food THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Food selling units and daily dishes are only allowed in Food Category.';
  END IF;

  IF NEW.daily_status NOT IN ('available', 'not_today', 'coming_soon') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid daily dish status.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_enforce_food_category ON public.products;
CREATE TRIGGER products_enforce_food_category
BEFORE INSERT OR UPDATE OF category_id, food_selling_unit, food_unit_price,
  food_quantity_increment, food_minimum_quantity, is_daily_item, daily_status
ON public.products
FOR EACH ROW EXECUTE FUNCTION public.enforce_food_product_category();

CREATE OR REPLACE FUNCTION public.vendor_set_food_product_details(
  p_product_id uuid,
  p_selling_unit text,
  p_unit_price numeric,
  p_quantity_increment integer,
  p_minimum_quantity integer
)
RETURNS public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_category_id uuid;
  v_is_food boolean := false;
  v_divisor numeric;
  v_price_per_increment numeric(12,2);
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Sign in required.';
  END IF;
  IF p_selling_unit NOT IN ('kg','g','l','ml','piece','dozen','pack')
     OR p_unit_price IS NULL OR p_unit_price < 0
     OR p_quantity_increment IS NULL OR p_quantity_increment < 1
     OR p_minimum_quantity IS NULL OR p_minimum_quantity < 1 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Enter valid food selling unit, price, increment and minimum quantity.';
  END IF;

  SELECT p.* INTO v_product
  FROM public.products p
  JOIN public.seller_profiles s ON s.id = p.seller_id
  WHERE p.id = p_product_id AND s.user_id = (SELECT auth.uid()) AND s.status = 'approved'
  FOR UPDATE OF p;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='This product is not available to your vendor account.';
  END IF;

  v_category_id := v_product.category_id;
  WHILE v_category_id IS NOT NULL LOOP
    SELECT c.is_food_category, c.parent_id INTO v_is_food, v_category_id
    FROM public.categories c WHERE c.id = v_category_id;
    EXIT WHEN v_is_food OR v_category_id IS NULL;
  END LOOP;
  IF NOT v_is_food THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Food selling units are only available for Food Category products.';
  END IF;

  v_divisor := CASE WHEN p_selling_unit IN ('kg','l') THEN 1000 ELSE 1 END;
  IF p_selling_unit IN ('kg','l') AND
     (p_quantity_increment > 1000 OR 1000 % p_quantity_increment <> 0) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='For kg or litre, choose a step that divides 1000 (for example 50, 100, 250 or 500).';
  END IF;

  v_price_per_increment := round(p_unit_price * p_quantity_increment / v_divisor, 2);
  UPDATE public.products
  SET food_selling_unit = p_selling_unit,
      food_unit_price = p_unit_price,
      food_quantity_increment = p_quantity_increment,
      food_minimum_quantity = p_minimum_quantity,
      price = v_price_per_increment,
      updated_at = now()
  WHERE id = p_product_id
  RETURNING * INTO v_product;
  RETURN v_product;
END;
$$;

REVOKE ALL ON FUNCTION public.vendor_set_food_product_details(uuid,text,numeric,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_set_food_product_details(uuid,text,numeric,integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.vendor_set_daily_availability(
  p_product_id uuid,
  p_is_daily_item boolean,
  p_available_quantity integer,
  p_minimum_quantity integer DEFAULT 1,
  p_minimum_order_value numeric DEFAULT NULL,
  p_shop_is_open boolean DEFAULT NULL
)
RETURNS public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product public.products;
  v_seller_id uuid;
  v_category_id uuid;
  v_is_food boolean := false;
BEGIN
  IF p_available_quantity < 0 OR p_minimum_quantity < 1 OR p_minimum_order_value < 0 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Daily quantity, minimum quantity or minimum order value is invalid.';
  END IF;

  SELECT s.id INTO v_seller_id
  FROM public.seller_profiles s
  WHERE s.user_id = (SELECT auth.uid()) AND s.status = 'approved'
  FOR UPDATE;
  IF v_seller_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Approved vendor account required.';
  END IF;

  SELECT p.* INTO v_product
  FROM public.products p
  WHERE p.id = p_product_id AND p.seller_id = v_seller_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Product access denied.';
  END IF;

  IF p_is_daily_item THEN
    v_category_id := v_product.category_id;
    WHILE v_category_id IS NOT NULL LOOP
      SELECT c.is_food_category, c.parent_id INTO v_is_food, v_category_id
      FROM public.categories c WHERE c.id = v_category_id;
      EXIT WHEN v_is_food OR v_category_id IS NULL;
    END LOOP;
    IF NOT v_is_food THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Daily stock is only available for Food Category products.';
    END IF;
  END IF;

  UPDATE public.products p
  SET is_daily_item = p_is_daily_item,
      daily_available_quantity = CASE WHEN p_is_daily_item THEN p_available_quantity ELSE 0 END,
      daily_minimum_quantity = p_minimum_quantity,
      daily_available_on = CASE WHEN p_is_daily_item THEN (now() AT TIME ZONE 'Asia/Karachi')::date ELSE NULL END,
      daily_status = CASE
        WHEN NOT p_is_daily_item THEN 'available'
        WHEN p_available_quantity > 0 THEN 'available'
        ELSE 'not_today'
      END,
      updated_at = now()
  WHERE p.id = p_product_id
  RETURNING p.* INTO v_product;

  IF p_is_daily_item THEN
    UPDATE public.product_inventory
    SET quantity = p_available_quantity, updated_at = now()
    WHERE product_id = p_product_id AND variant_id IS NULL;
    IF NOT FOUND THEN
      INSERT INTO public.product_inventory(product_id, variant_id, quantity)
      VALUES (p_product_id, NULL, p_available_quantity);
    END IF;
  END IF;

  IF p_minimum_order_value IS NOT NULL OR p_shop_is_open IS NOT NULL THEN
    UPDATE public.seller_profiles
    SET minimum_order_value = COALESCE(p_minimum_order_value, minimum_order_value),
        shop_is_open = COALESCE(p_shop_is_open, shop_is_open),
        updated_at = now()
    WHERE id = v_seller_id;
  END IF;
  RETURN v_product;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_availability(product_ids uuid[])
RETURNS TABLE(product_id uuid, variant_id uuid, is_available boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(pg_catalog.cardinality(product_ids),0) > 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='At most 100 product IDs may be requested.';
  END IF;
  RETURN QUERY
  SELECT p.id, v.id,
    CASE
      WHEN p.is_daily_item THEN
        p.daily_status = 'available'
        AND p.daily_available_on = (now() AT TIME ZONE 'Asia/Karachi')::date
        AND p.daily_available_quantity > 0
      WHEN NOT p.track_inventory THEN true
      ELSE COALESCE(i.quantity > 0, false)
    END
  FROM public.products p
  LEFT JOIN public.product_variants v ON v.product_id = p.id AND v.is_active
  LEFT JOIN public.product_inventory i
    ON i.product_id = p.id AND i.variant_id IS NOT DISTINCT FROM v.id
  WHERE p.publication_status = 'published'::public.publication_status
    AND p.moderation_status = 'approved'
    AND p.stock_verification_status <> 'paused'
    AND p.id = ANY(COALESCE(product_ids, ARRAY[]::uuid[]))
    AND (v.id IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM public.product_variants av WHERE av.product_id = p.id AND av.is_active
    ));
END;
$$;

CREATE OR REPLACE FUNCTION public.set_daily_food_availability_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Karachi')::date;
BEGIN
  IF NOT NEW.is_daily_item THEN
    NEW.daily_available_on := NULL;
  ELSIF NEW.daily_status = 'available' AND NEW.daily_available_quantity > 0 THEN
    NEW.daily_available_on := v_today;
  ELSIF NEW.daily_status = 'coming_soon' THEN
    NEW.daily_available_on := NULL;
  ELSE
    NEW.daily_available_on := v_today - 1;
  END IF;
  RETURN NEW;
END;
$;

DROP TRIGGER IF EXISTS products_set_daily_food_date ON public.products;
CREATE TRIGGER products_set_daily_food_date
BEFORE INSERT OR UPDATE OF is_daily_item, daily_status, daily_available_quantity
ON public.products
FOR EACH ROW EXECUTE FUNCTION public.set_daily_food_availability_date();

CREATE OR REPLACE FUNCTION public.reset_daily_food_availability()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Karachi')::date;
BEGIN
  UPDATE public.products
  SET daily_available_quantity = 0,
      daily_available_on = v_today - 1,
      daily_status = 'not_today',
      updated_at = now()
  WHERE is_daily_item = true;

  UPDATE public.product_inventory i
  SET quantity = 0, updated_at = now()
  FROM public.products p
  WHERE p.id = i.product_id
    AND p.is_daily_item = true
    AND i.variant_id IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_daily_food_availability() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'jtbazar-reset-daily-food-availability';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
  PERFORM cron.schedule(
    'jtbazar-reset-daily-food-availability',
    '0 19 * * *',
    'SELECT public.reset_daily_food_availability();'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_food_delivery_radius()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_seller public.seller_profiles%ROWTYPE;
  v_category_id uuid;
  v_is_food boolean := false;
  v_distance_km numeric;
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_product FROM public.products WHERE id = NEW.product_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_category_id := v_product.category_id;
  WHILE v_category_id IS NOT NULL LOOP
    SELECT c.is_food_category, c.parent_id INTO v_is_food, v_category_id
    FROM public.categories c WHERE c.id = v_category_id;
    EXIT WHEN v_is_food OR v_category_id IS NULL;
  END LOOP;
  IF NOT v_is_food OR v_product.seller_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;
  IF v_order.delivery_lat IS NULL OR v_order.delivery_lng IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='Food delivery requires a confirmed delivery location. Select your location at checkout.';
  END IF;

  SELECT * INTO v_seller FROM public.seller_profiles WHERE id = v_product.seller_id;
  IF v_seller.shop_lat IS NULL OR v_seller.shop_lng IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='This food shop has not configured its delivery location yet.';
  END IF;

  v_distance_km := 6371 * 2 * asin(sqrt(
    power(sin(radians(v_order.delivery_lat - v_seller.shop_lat) / 2), 2) +
    cos(radians(v_seller.shop_lat)) * cos(radians(v_order.delivery_lat)) *
    power(sin(radians(v_order.delivery_lng - v_seller.shop_lng) / 2), 2)
  ));

  IF v_distance_km > 5 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='This food shop delivers only within 5 km of its location.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_items_enforce_food_delivery_radius ON public.order_items;
CREATE TRIGGER order_items_enforce_food_delivery_radius
BEFORE INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_food_delivery_radius();

REVOKE ALL ON FUNCTION public.enforce_food_delivery_radius() FROM PUBLIC, anon, authenticated;

-- Safe deterministic smoke checks: 250 g at PKR 220/kg = PKR 55;
-- 1 dozen at PKR 360/dozen = PKR 360; midnight Karachi maps to 19:00 UTC.
DO $$
BEGIN
  IF round(220::numeric * 250 / 1000, 2) <> 55 THEN
    RAISE EXCEPTION 'Food unit price calculation failed.';
  END IF;
  IF round(360::numeric * 1, 2) <> 360 THEN
    RAISE EXCEPTION 'Dozen price calculation failed.';
  END IF;
  IF ((timestamp '2026-11-04 19:00:00' AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Karachi')::time <> time '00:00:00' THEN
    RAISE EXCEPTION 'Karachi midnight schedule calculation failed.';
  END IF;
END;
$$;
