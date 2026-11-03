BEGIN;

-- Expose only the available quantity for published products; never grant
-- clients direct access to the private product_inventory table.
CREATE OR REPLACE FUNCTION public.get_public_inventory(product_ids uuid[])
RETURNS TABLE (
  product_id uuid,
  variant_id uuid,
  available_quantity integer
)
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
    CASE WHEN NOT p.track_inventory THEN NULL::integer ELSE COALESCE(i.quantity, 0) END
  FROM public.products AS p
  LEFT JOIN public.product_variants AS v
    ON v.product_id = p.id AND v.is_active
  LEFT JOIN public.product_inventory AS i
    ON i.product_id = p.id AND i.variant_id IS NOT DISTINCT FROM v.id
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

REVOKE ALL ON FUNCTION public.get_public_inventory(uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_inventory(uuid[]) TO anon, authenticated;

-- Protect stock limits even when a client writes directly to cart_items.
CREATE OR REPLACE FUNCTION private.enforce_cart_item_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  product_row public.products%ROWTYPE;
  stock_quantity integer;
  has_active_variants boolean;
BEGIN
  SELECT * INTO product_row
  FROM public.products AS p
  WHERE p.id = NEW.product_id
  FOR SHARE;

  IF NOT FOUND
     OR product_row.publication_status <> 'published'::public.publication_status
     OR product_row.moderation_status <> 'approved'
     OR product_row.stock_verification_status = 'paused' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This product is not currently available.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.product_variants AS v
    WHERE v.product_id = NEW.product_id AND v.is_active
  ) INTO has_active_variants;

  IF has_active_variants AND NEW.variant_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose a product variant before adding it to the cart.';
  END IF;

  IF NEW.variant_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.product_variants AS v
    WHERE v.id = NEW.variant_id AND v.product_id = NEW.product_id AND v.is_active
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The selected product variant is not available.';
  END IF;

  IF product_row.track_inventory THEN
    SELECT i.quantity INTO stock_quantity
    FROM public.product_inventory AS i
    WHERE i.product_id = NEW.product_id
      AND i.variant_id IS NOT DISTINCT FROM NEW.variant_id
    FOR SHARE;

    IF stock_quantity IS NULL OR NEW.quantity > stock_quantity THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'Cart quantity exceeds the available stock for this product option.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_cart_item_stock() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cart_items_enforce_stock ON public.cart_items;
CREATE TRIGGER cart_items_enforce_stock
  BEFORE INSERT OR UPDATE OF product_id, variant_id, quantity
  ON public.cart_items
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_cart_item_stock();

COMMIT;
