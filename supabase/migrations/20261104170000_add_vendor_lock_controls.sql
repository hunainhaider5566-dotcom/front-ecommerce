ALTER TABLE public.seller_profiles
  ADD COLUMN IF NOT EXISTS vendor_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vendor_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS vendor_locked_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS vendor_lock_reason text;

CREATE OR REPLACE FUNCTION public.admin_set_vendor_lock(
  p_seller_id uuid,
  p_locked boolean,
  p_reason text DEFAULT NULL
)
RETURNS public.seller_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_row public.seller_profiles;
BEGIN
  IF NOT private.has_role('admin'::app_role) THEN
    RAISE EXCEPTION 'Only administrators can lock or unlock vendors' USING ERRCODE = '42501';
  END IF;

  UPDATE public.seller_profiles
  SET vendor_locked = p_locked,
      vendor_locked_at = CASE WHEN p_locked THEN now() ELSE NULL END,
      vendor_locked_by = CASE WHEN p_locked THEN auth.uid() ELSE NULL END,
      vendor_lock_reason = CASE WHEN p_locked THEN NULLIF(btrim(p_reason), '') ELSE NULL END,
      updated_at = now()
  WHERE id = p_seller_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Seller profile not found';
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_vendor_lock(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_vendor_lock(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION private.reject_locked_vendor_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private
AS $$
DECLARE
  v_seller_id uuid;
  v_locked boolean := false;
BEGIN
  IF private.has_role('admin'::app_role) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_TABLE_NAME = 'seller_profiles' THEN
    SELECT vendor_locked INTO v_locked
    FROM public.seller_profiles
    WHERE user_id = auth.uid();
  ELSIF TG_TABLE_NAME = 'products' THEN
    v_seller_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.seller_id ELSE NEW.seller_id END;
  ELSE
    v_seller_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END;
    SELECT seller_id INTO v_seller_id FROM public.products WHERE id = v_seller_id;
  END IF;

  IF v_seller_id IS NOT NULL THEN
    SELECT vendor_locked INTO v_locked
    FROM public.seller_profiles
    WHERE id = v_seller_id;
  END IF;

  IF COALESCE(v_locked, false) THEN
    RAISE EXCEPTION 'Your seller account is locked. You cannot change shop or product data until an administrator unlocks it.'
      USING ERRCODE = '42501';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS reject_locked_vendor_profile_mutation ON public.seller_profiles;
CREATE TRIGGER reject_locked_vendor_profile_mutation
BEFORE UPDATE OR DELETE ON public.seller_profiles
FOR EACH ROW EXECUTE FUNCTION private.reject_locked_vendor_mutation();

DROP TRIGGER IF EXISTS reject_locked_vendor_product_mutation ON public.products;
CREATE TRIGGER reject_locked_vendor_product_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.products
FOR EACH ROW EXECUTE FUNCTION private.reject_locked_vendor_mutation();

DROP TRIGGER IF EXISTS reject_locked_vendor_product_images_mutation ON public.product_images;
CREATE TRIGGER reject_locked_vendor_product_images_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.product_images
FOR EACH ROW EXECUTE FUNCTION private.reject_locked_vendor_mutation();

DROP TRIGGER IF EXISTS reject_locked_vendor_variants_mutation ON public.product_variants;
CREATE TRIGGER reject_locked_vendor_variants_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION private.reject_locked_vendor_mutation();

DROP TRIGGER IF EXISTS reject_locked_vendor_inventory_mutation ON public.product_inventory;
CREATE TRIGGER reject_locked_vendor_inventory_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.product_inventory
FOR EACH ROW EXECUTE FUNCTION private.reject_locked_vendor_mutation();

DROP TRIGGER IF EXISTS reject_locked_vendor_inventory_movements_mutation ON public.inventory_movements;
CREATE TRIGGER reject_locked_vendor_inventory_movements_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.inventory_movements
FOR EACH ROW EXECUTE FUNCTION private.reject_locked_vendor_mutation();
