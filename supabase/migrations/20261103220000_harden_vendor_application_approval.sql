BEGIN;

CREATE OR REPLACE FUNCTION private.validate_seller_application_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    IF length(btrim(COALESCE(NEW.shop_name, ''))) < 2 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Shop name is required.';
    END IF;
    IF NEW.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A valid shop URL is required.';
    END IF;
    IF length(btrim(COALESCE(NEW.description, ''))) < 10 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A shop description of at least 10 characters is required.';
    END IF;
    IF NEW.contact_email IS NULL OR NEW.contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A valid business contact email is required.';
    END IF;
    IF NEW.phone IS NULL OR NEW.phone !~ '^(03[0-9]{9}|[+]923[0-9]{9})$' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A valid Pakistani business phone number is required.';
    END IF;
    IF length(btrim(COALESCE(NEW.current_address, ''))) < 3 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Current Address is required.';
    END IF;
    IF length(btrim(COALESCE(NEW.complete_address, ''))) < 10 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Complete Address is required.';
    END IF;
    IF NEW.document_path IS NULL OR btrim(NEW.document_path) = '' OR split_part(NEW.document_path, '/', 1) <> NEW.user_id::text THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A valid private identity or business verification document is required.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM storage.objects AS so
      WHERE so.bucket_id = 'vendor-documents' AND so.name = NEW.document_path
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Upload the private verification document before submitting the application.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_seller(
  p_seller_id uuid,
  p_status public.seller_status,
  p_reason text DEFAULT NULL::text
)
RETURNS public.seller_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  result_row public.seller_profiles;
  clean_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF NOT private.has_role('admin'::public.app_role) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Administrator access is required.';
  END IF;

  IF p_status NOT IN ('approved', 'rejected', 'suspended') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid seller review status.';
  END IF;

  IF p_status IN ('rejected', 'suspended') AND (clean_reason IS NULL OR length(clean_reason) < 3 OR length(clean_reason) > 1000) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A review reason between 3 and 1,000 characters is required.';
  END IF;

  IF p_status = 'approved' THEN
    SELECT * INTO result_row FROM public.seller_profiles WHERE id = p_seller_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Seller application was not found.';
    END IF;
    IF length(btrim(COALESCE(result_row.shop_name, ''))) < 2
      OR result_row.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      OR length(btrim(COALESCE(result_row.description, ''))) < 10
      OR result_row.contact_email IS NULL
      OR result_row.contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
      OR result_row.phone IS NULL
      OR result_row.phone !~ '^(03[0-9]{9}|[+]923[0-9]{9})$'
      OR length(btrim(COALESCE(result_row.current_address, ''))) < 3
      OR length(btrim(COALESCE(result_row.complete_address, ''))) < 10
      OR result_row.document_path IS NULL
      OR split_part(result_row.document_path, '/', 1) <> result_row.user_id::text
      OR NOT EXISTS (SELECT 1 FROM storage.objects so WHERE so.bucket_id = 'vendor-documents' AND so.name = result_row.document_path)
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'This vendor application is incomplete. Ask the vendor to correct all required fields and upload a valid verification document before approval.';
    END IF;
  END IF;

  UPDATE public.seller_profiles
  SET status = p_status,
      rejection_reason = CASE WHEN p_status = 'approved' THEN NULL ELSE clean_reason END,
      reviewed_by = (SELECT auth.uid()),
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_seller_id
  RETURNING * INTO result_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Seller application was not found.';
  END IF;

  IF result_row.user_id = (SELECT auth.uid()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Self-approval is not permitted.';
  END IF;

  INSERT INTO public.admin_audit_logs (actor_id, action, entity, entity_id, details)
  VALUES ((SELECT auth.uid()), 'UPDATE', 'seller_profiles', result_row.id,
    jsonb_build_object('status', p_status, 'reason', clean_reason));

  IF p_status = 'approved' THEN
    INSERT INTO public.user_roles (user_id, role, assigned_by)
    VALUES (result_row.user_id, 'vendor'::public.app_role, (SELECT auth.uid()))
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles
    WHERE user_id = result_row.user_id AND role = 'vendor'::public.app_role;
  END IF;

  RETURN result_row;
END;
$function$;

REVOKE ALL ON FUNCTION private.validate_seller_application_fields() FROM PUBLIC, anon, authenticated;

COMMIT;
