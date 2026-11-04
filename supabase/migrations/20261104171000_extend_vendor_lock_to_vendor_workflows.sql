CREATE OR REPLACE FUNCTION private.reject_locked_vendor_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private
AS $$
DECLARE
  v_seller_id uuid;
  v_product_id uuid;
  v_locked boolean := false;
BEGIN
  IF private.has_role('admin'::app_role) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_TABLE_NAME = 'seller_profiles' THEN
    SELECT vendor_locked INTO v_locked
    FROM public.seller_profiles
    WHERE user_id = auth.uid();
  ELSIF TG_TABLE_NAME IN ('support_tickets', 'vendor_order_pickups', 'product_deletion_requests', 'marketplace_cases') THEN
    v_seller_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.seller_id ELSE NEW.seller_id END;
  ELSIF TG_TABLE_NAME = 'products' THEN
    v_seller_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.seller_id ELSE NEW.seller_id END;
  ELSE
    v_product_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END;
    SELECT seller_id INTO v_seller_id FROM public.products WHERE id = v_product_id;
  END IF;

  IF v_seller_id IS NOT NULL THEN
    SELECT vendor_locked INTO v_locked
    FROM public.seller_profiles
    WHERE id = v_seller_id;
  END IF;

  IF COALESCE(v_locked, false) THEN
    RAISE EXCEPTION 'Your seller account is locked. You cannot change shop, product, inventory or vendor workflow data until an administrator unlocks it.'
      USING ERRCODE = '42501';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS reject_locked_vendor_support_ticket_mutation ON public.support_tickets;
CREATE TRIGGER reject_locked_vendor_support_ticket_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION private.reject_locked_vendor_mutation();

DROP TRIGGER IF EXISTS reject_locked_vendor_pickup_mutation ON public.vendor_order_pickups;
CREATE TRIGGER reject_locked_vendor_pickup_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.vendor_order_pickups
FOR EACH ROW EXECUTE FUNCTION private.reject_locked_vendor_mutation();

DROP TRIGGER IF EXISTS reject_locked_vendor_deletion_request_mutation ON public.product_deletion_requests;
CREATE TRIGGER reject_locked_vendor_deletion_request_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.product_deletion_requests
FOR EACH ROW EXECUTE FUNCTION private.reject_locked_vendor_mutation();

DROP TRIGGER IF EXISTS reject_locked_vendor_case_mutation ON public.marketplace_cases;
CREATE TRIGGER reject_locked_vendor_case_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.marketplace_cases
FOR EACH ROW EXECUTE FUNCTION private.reject_locked_vendor_mutation();