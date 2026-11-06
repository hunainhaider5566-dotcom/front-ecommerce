-- Require Supabase Auth AAL2 (verified TOTP MFA) for all signed-in
-- marketplace table access and authenticated SECURITY DEFINER business RPCs.
-- Anonymous storefront reads and service_role-only operations remain unchanged.

DO $$
DECLARE
  table_row record;
BEGIN
  FOR table_row IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_row.relname
        AND policyname = 'require_aal2_for_authenticated_access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY require_aal2_for_authenticated_access ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((auth.jwt() ->> ''aal'') = ''aal2'') WITH CHECK ((auth.jwt() ->> ''aal'') = ''aal2'')',
        table_row.relname
      );
    END IF;
  END LOOP;
END;
$$;

-- SECURITY DEFINER functions bypass table RLS. Require AAL2 in every
-- SECURITY DEFINER PL/pgSQL function that authenticated users can execute.
DO $$
DECLARE
  fn record;
  definition text;
  guarded_definition text;
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND l.lanname = 'plpgsql'
      AND p.prorettype <> 'trigger'::regtype
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND p.proname NOT IN ('get_public_availability', 'subscribe_newsletter')
  LOOP
    definition := pg_get_functiondef(fn.oid);
    IF position('JTBazar MFA verification is required.' IN definition) = 0 THEN
      guarded_definition := regexp_replace(
        definition,
        E'\nBEGIN\n',
        E'\nBEGIN\n  IF (auth.jwt() ->> ''role'') IS DISTINCT FROM ''service_role'' AND (auth.jwt() ->> ''aal'') IS DISTINCT FROM ''aal2'' THEN\n    RAISE EXCEPTION USING ERRCODE = ''42501'', MESSAGE = ''JTBazar MFA verification is required.'';\n  END IF;\n',
        ''
      );
      IF guarded_definition = definition THEN
        RAISE EXCEPTION 'Could not safely add MFA guard to function %', fn.proname;
      END IF;
      EXECUTE guarded_definition;
    END IF;
  END LOOP;
END;
$$;

-- This SQL SECURITY DEFINER RPC returns only a vendor's own order-line
-- projection (with customer fields deliberately NULL), but still requires AAL2.
CREATE OR REPLACE FUNCTION public.vendor_order_items()
RETURNS TABLE(
  id uuid, order_id uuid, order_number text, shop_name text,
  customer_name text, customer_phone text, shipping_address_snapshot jsonb,
  delivery_location_name text, payment_method text,
  order_created_at timestamptz, product_name_snapshot text,
  product_image_url text, sku_snapshot text, variant_snapshot jsonb,
  quantity integer, unit_price numeric, line_total numeric,
  vendor_fulfillment_status text, tracking_number text, tracking_url text,
  vendor_note text, vendor_updated_at timestamptz, created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    oi.id, oi.order_id, o.order_number, seller.shop_name,
    NULL::text, NULL::text, NULL::jsonb, NULL::text, NULL::text,
    o.created_at, oi.product_name_snapshot,
    (SELECT pi.image_url FROM public.product_images AS pi
      WHERE pi.product_id = oi.product_id
      ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.created_at ASC LIMIT 1),
    oi.sku_snapshot, oi.variant_snapshot, oi.quantity, oi.unit_price, oi.line_total,
    CASE
      WHEN o.order_status::text IN ('pending', 'confirmed') THEN 'pending'
      WHEN o.order_status::text = 'delivered' THEN 'delivered'
      WHEN o.order_status::text = 'cancelled' THEN 'cancelled'
      ELSE 'processing'
    END,
    NULL::text, NULL::text, NULL::text, oi.vendor_updated_at, oi.created_at
  FROM public.order_items AS oi
  JOIN public.orders AS o ON o.id = oi.order_id
  JOIN public.seller_profiles AS seller ON seller.id = oi.seller_id
  WHERE ((auth.jwt() ->> 'role') = 'service_role' OR (auth.jwt() ->> 'aal') = 'aal2')
    AND seller.user_id = (SELECT auth.uid())
    AND seller.status = 'approved';
$function$;

-- The role-check helper is called during profile bootstrap. Returning false
-- at AAL1 prevents role metadata from being used before MFA is verified.
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT (auth.jwt() ->> 'aal') = 'aal2'
     AND private.has_role('admin'::public.app_role);
$function$;
