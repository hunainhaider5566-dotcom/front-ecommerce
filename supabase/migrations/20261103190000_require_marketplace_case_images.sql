BEGIN;

-- Case evidence is private. Only the owner and marketplace administrators can read it.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'complaint-evidence',
  'complaint-evidence',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[];

DROP POLICY IF EXISTS complaint_evidence_insert_own ON storage.objects;
CREATE POLICY complaint_evidence_insert_own
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'complaint-evidence'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS complaint_evidence_select_owner_or_admin ON storage.objects;
CREATE POLICY complaint_evidence_select_owner_or_admin
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'complaint-evidence'
  AND (
    (storage.foldername(name))[1] = (SELECT auth.uid())::text
    OR public.current_user_is_admin()
  )
);

CREATE OR REPLACE FUNCTION private.validate_marketplace_case_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  linked_order_id uuid;
  linked_customer_id uuid;
  linked_seller_id uuid;
  evidence_mime text;
BEGIN
  IF NEW.order_item_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Select the exact product involved in this case.';
  END IF;

  IF length(btrim(COALESCE(NEW.reason, ''))) < 3 OR length(NEW.reason) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A case reason between 3 and 2,000 characters is required.';
  END IF;

  IF NEW.evidence_path IS NULL OR NEW.evidence_path !~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}-[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp|avif)$' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A valid product evidence image is required.';
  END IF;

  IF auth.uid() IS NOT NULL AND NEW.buyer_id <> auth.uid() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'You can only submit a case for your own account.';
  END IF;

  SELECT o.customer_id INTO linked_customer_id
  FROM public.orders AS o
  WHERE o.id = NEW.order_id;

  IF linked_customer_id IS NULL OR linked_customer_id <> NEW.buyer_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The selected order does not belong to this customer.';
  END IF;

  SELECT oi.order_id, oi.seller_id INTO linked_order_id, linked_seller_id
  FROM public.order_items AS oi
  WHERE oi.id = NEW.order_item_id;

  IF linked_order_id IS NULL OR linked_order_id <> NEW.order_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The selected product does not belong to this order.';
  END IF;

  IF NEW.seller_id IS DISTINCT FROM linked_seller_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The case seller does not match the selected order item.';
  END IF;

  IF split_part(NEW.evidence_path, '/', 2) NOT LIKE NEW.order_id::text || '-%' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The evidence image does not belong to the selected order.';
  END IF;

  SELECT so.metadata ->> 'mimetype' INTO evidence_mime
  FROM storage.objects AS so
  WHERE so.bucket_id = 'complaint-evidence'
    AND so.name = NEW.evidence_path;

  IF evidence_mime IS NULL OR evidence_mime NOT IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Upload a valid JPG, PNG, WebP or AVIF evidence image before submitting.';
  END IF;

  IF split_part(NEW.evidence_path, '/', 1) <> NEW.buyer_id::text THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Evidence must belong to the customer submitting this case.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.validate_marketplace_case_evidence() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS marketplace_cases_require_evidence ON public.marketplace_cases;
CREATE TRIGGER marketplace_cases_require_evidence
BEFORE INSERT OR UPDATE OF order_id, order_item_id, buyer_id, reason, evidence_path
ON public.marketplace_cases
FOR EACH ROW
EXECUTE FUNCTION private.validate_marketplace_case_evidence();

COMMIT;
