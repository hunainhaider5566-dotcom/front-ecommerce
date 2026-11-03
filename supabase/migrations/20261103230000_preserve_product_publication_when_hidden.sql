BEGIN;

CREATE OR REPLACE FUNCTION public.admin_moderate_product(
  p_product_id uuid,
  p_status text,
  p_reason text DEFAULT NULL::text
)
RETURNS public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  result_row public.products;
BEGIN
  IF NOT private.has_role('admin'::public.app_role) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Administrator access is required.';
  END IF;

  IF p_status NOT IN ('pending_review', 'approved', 'rejected', 'hidden', 'archived') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid moderation status.';
  END IF;

  UPDATE public.products
  SET moderation_status = p_status,
      moderation_reason = NULLIF(btrim(p_reason), ''),
      moderated_by = (SELECT auth.uid()),
      moderated_at = now(),
      -- Moderation visibility and storefront publication are separate controls.
      -- Hiding a product must not destroy its previous draft/published state.
      publication_status = CASE
        WHEN p_status IN ('pending_review', 'rejected', 'archived')
          THEN 'draft'::public.publication_status
        ELSE publication_status
      END,
      updated_at = now()
  WHERE id = p_product_id
  RETURNING * INTO result_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Product was not found.';
  END IF;

  INSERT INTO public.admin_audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (
    (SELECT auth.uid()),
    'UPDATE',
    'products',
    result_row.id,
    jsonb_build_object('moderation_status', p_status, 'reason', p_reason, 'publication_status', result_row.publication_status)
  );

  RETURN result_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_moderate_product(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_moderate_product(uuid, text, text) TO authenticated;

COMMIT;
