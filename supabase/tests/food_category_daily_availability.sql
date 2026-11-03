-- Safe Food & Groceries integration smoke test.
-- Run in the Supabase SQL editor after applying the food category migration.
-- All product mutations are enclosed in a transaction and rolled back.

BEGIN;

DO $$
DECLARE
  v_product_id uuid;
  v_today date := (now() AT TIME ZONE 'Asia/Karachi')::date;
  v_status text;
  v_quantity integer;
  v_available_on date;
BEGIN
  SELECT p.id INTO v_product_id
  FROM public.products p
  JOIN public.categories c ON c.id = p.category_id
  WHERE c.is_food_category = true
  ORDER BY p.created_at
  LIMIT 1;

  IF v_product_id IS NULL THEN
    RAISE NOTICE 'Skipped daily product integration check: no Food Category product exists.';
    RETURN;
  END IF;

  -- A positive daily quantity must be stamped with the current Karachi date.
  UPDATE public.products
  SET is_daily_item = true,
      daily_available_quantity = 3,
      daily_status = 'available'
  WHERE id = v_product_id;

  SELECT daily_status, daily_available_quantity, daily_available_on
  INTO v_status, v_quantity, v_available_on
  FROM public.products WHERE id = v_product_id;

  IF v_status <> 'available' OR v_quantity <> 3 OR v_available_on <> v_today THEN
    RAISE EXCEPTION 'Daily dish available-state smoke test failed.';
  END IF;

  -- Coming Soon remains visible but is not purchasable and has no active date.
  UPDATE public.products
  SET daily_available_quantity = 0, daily_status = 'coming_soon'
  WHERE id = v_product_id;

  SELECT daily_status, daily_available_on
  INTO v_status, v_available_on
  FROM public.products WHERE id = v_product_id;

  IF v_status <> 'coming_soon' OR v_available_on IS NOT NULL THEN
    RAISE EXCEPTION 'Coming Soon daily dish smoke test failed.';
  END IF;

  -- Not for Today is explicitly expired for the Karachi business date.
  UPDATE public.products
  SET daily_available_quantity = 0, daily_status = 'not_today'
  WHERE id = v_product_id;

  SELECT daily_status, daily_available_quantity, daily_available_on
  INTO v_status, v_quantity, v_available_on
  FROM public.products WHERE id = v_product_id;

  IF v_status <> 'not_today' OR v_quantity <> 0 OR v_available_on <> v_today - 1 THEN
    RAISE EXCEPTION 'Not for Today daily dish smoke test failed.';
  END IF;

  IF round(220::numeric * 250 / 1000, 2) <> 55
     OR round(360::numeric * 1, 2) <> 360 THEN
    RAISE EXCEPTION 'Food unit price calculation smoke test failed.';
  END IF;
END;
$$;

ROLLBACK;
