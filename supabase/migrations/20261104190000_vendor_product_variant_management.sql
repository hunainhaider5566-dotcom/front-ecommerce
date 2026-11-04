-- Allow approved vendors to manage their own product variants through a
-- narrowly scoped RPC. Direct table writes remain admin-only.
CREATE OR REPLACE FUNCTION public.vendor_save_product_variants(
  p_product_id uuid,
  p_variants jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_seller public.seller_profiles;
  v_product public.products;
  v_item jsonb;
  v_variant_id uuid;
  v_saved public.product_variants;
  v_label text;
  v_value text;
  v_sku text;
  v_price numeric;
  v_stock integer;
  v_sort integer := 0;
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sign in to manage product variants.';
  END IF;
  IF jsonb_typeof(COALESCE(p_variants, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_variants, '[]'::jsonb)) > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Variants must be an array containing no more than 100 entries.';
  END IF;

  SELECT * INTO v_seller
  FROM public.seller_profiles
  WHERE user_id = (SELECT auth.uid()) AND status = 'approved'
  FOR SHARE;
  IF NOT FOUND OR COALESCE(v_seller.vendor_locked, false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'An unlocked, approved seller account is required.';
  END IF;

  SELECT * INTO v_product
  FROM public.products
  WHERE id = p_product_id AND seller_id = v_seller.id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'You can only manage variants for your own products.';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_variants, '[]'::jsonb))
  LOOP
    v_label := NULLIF(btrim(v_item->>'option_label'), '');
    v_value := NULLIF(btrim(v_item->>'option_value'), '');
    v_sku := NULLIF(btrim(v_item->>'sku'), '');
    v_price := CASE WHEN NULLIF(v_item->>'price_override', '') IS NULL THEN NULL ELSE (v_item->>'price_override')::numeric END;
    v_stock := COALESCE(NULLIF(v_item->>'quantity', '')::integer, 0);

    IF v_label IS NULL OR char_length(v_label) > 80
       OR v_value IS NULL OR char_length(v_value) > 160
       OR (v_sku IS NOT NULL AND char_length(v_sku) > 100)
       OR (v_price IS NOT NULL AND v_price < 0)
       OR v_stock < 0 OR v_stock > 2147483647 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Each variant needs a valid option name, value, price and stock quantity.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.product_variants pv
      WHERE pv.product_id = p_product_id
        AND lower(pv.option_label) = lower(v_label)
        AND lower(pv.option_value) = lower(v_value)
        AND pv.id <> COALESCE(NULLIF(v_item->>'id', '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Duplicate variant option and value. Each variant must be unique.';
    END IF;

    IF NULLIF(v_item->>'id', '') IS NOT NULL THEN
      v_variant_id := (v_item->>'id')::uuid;
      UPDATE public.product_variants
      SET option_label = v_label,
          option_value = v_value,
          sku = v_sku,
          price_override = v_price,
          attributes = CASE WHEN jsonb_typeof(v_item->'attributes') = 'object' THEN v_item->'attributes' ELSE '{}'::jsonb END,
          is_active = true,
          sort_order = v_sort,
          updated_at = now()
      WHERE id = v_variant_id AND product_id = p_product_id
      RETURNING * INTO v_saved;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'A selected variant does not belong to this product.';
      END IF;
    ELSE
      INSERT INTO public.product_variants(product_id, option_label, option_value, sku, price_override, attributes, is_active, sort_order)
      VALUES (p_product_id, v_label, v_value, v_sku, v_price,
        CASE WHEN jsonb_typeof(v_item->'attributes') = 'object' THEN v_item->'attributes' ELSE '{}'::jsonb END,
        true, v_sort)
      RETURNING * INTO v_saved;
    END IF;

    SELECT id INTO v_variant_id FROM public.product_inventory
    WHERE product_id = p_product_id AND variant_id = v_saved.id
    LIMIT 1;
    IF v_variant_id IS NULL THEN
      INSERT INTO public.product_inventory(product_id, variant_id, quantity, low_stock_threshold)
      VALUES (p_product_id, v_saved.id, v_stock, 5);
    ELSE
      UPDATE public.product_inventory SET quantity = v_stock, updated_at = now()
      WHERE id = v_variant_id;
    END IF;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', v_saved.id, 'product_id', v_saved.product_id,
      'option_label', v_saved.option_label, 'option_value', v_saved.option_value,
      'sku', v_saved.sku, 'price_override', v_saved.price_override,
      'attributes', v_saved.attributes, 'is_active', v_saved.is_active,
      'sort_order', v_saved.sort_order
    ));
    v_sort := v_sort + 1;
    v_variant_id := NULL;
  END LOOP;

  DELETE FROM public.product_variants pv
  WHERE pv.product_id = p_product_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(p_variants, '[]'::jsonb)) AS entries(value)
      WHERE NULLIF(value->>'id', '') IS NOT NULL AND (value->>'id')::uuid = pv.id
    );

  IF jsonb_array_length(COALESCE(p_variants, '[]'::jsonb)) > 0 THEN
    -- Variant stock replaces the base-product stock row.
    DELETE FROM public.product_inventory
    WHERE product_id = p_product_id AND variant_id IS NULL;
    UPDATE public.products
    SET track_inventory = true,
        publication_status = 'draft',
        moderation_status = 'pending_review',
        moderation_reason = NULL,
        updated_at = now()
    WHERE id = p_product_id;
  ELSE
    -- Keep simple-SKU products orderable when a vendor removes all variants.
    IF NOT EXISTS (SELECT 1 FROM public.product_inventory WHERE product_id = p_product_id AND variant_id IS NULL) THEN
      INSERT INTO public.product_inventory(product_id, variant_id, quantity, low_stock_threshold)
      VALUES (p_product_id, NULL, 0, 5);
    END IF;
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.vendor_save_product_variants(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_save_product_variants(uuid, jsonb) TO authenticated;
