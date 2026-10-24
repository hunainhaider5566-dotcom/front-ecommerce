BEGIN;

-- Support lookups and parent deletes across the foreign keys identified by the Supabase advisor.
CREATE INDEX admin_order_notes_created_by_idx ON public.admin_order_notes (created_by);
CREATE INDEX categories_parent_id_idx ON public.categories (parent_id);
CREATE INDEX inventory_movements_actor_id_idx ON public.inventory_movements (actor_id);
CREATE INDEX inventory_movements_variant_id_idx ON public.inventory_movements (variant_id);
CREATE INDEX notifications_related_order_id_idx ON public.notifications (related_order_id);
CREATE INDEX order_items_variant_id_idx ON public.order_items (variant_id);
CREATE INDEX product_inventory_variant_product_fk_idx ON public.product_inventory (variant_id, product_id);
CREATE INDEX products_category_id_idx ON public.products (category_id);
CREATE INDEX user_roles_assigned_by_idx ON public.user_roles (assigned_by);
CREATE INDEX wishlist_items_product_id_idx ON public.wishlist_items (product_id);
CREATE INDEX wishlist_items_variant_product_fk_idx ON public.wishlist_items (variant_id, product_id);

-- Keep protected role records inaccessible even if table grants are accidentally broadened later.
CREATE POLICY user_roles_deny_client_access
  ON public.user_roles FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- Separate anonymous public reads from authenticated admin visibility so SELECT does not
-- evaluate multiple permissive policies for the same role/action.
DROP POLICY categories_public_read ON public.categories;
DROP POLICY categories_admin_manage ON public.categories;
CREATE POLICY categories_anon_read
  ON public.categories FOR SELECT TO anon
  USING (is_active);
CREATE POLICY categories_authenticated_read
  ON public.categories FOR SELECT TO authenticated
  USING (is_active OR (SELECT private.has_role('admin'::public.app_role)));
CREATE POLICY categories_admin_insert
  ON public.categories FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_role('admin'::public.app_role)));
CREATE POLICY categories_admin_update
  ON public.categories FOR UPDATE TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)))
  WITH CHECK ((SELECT private.has_role('admin'::public.app_role)));
CREATE POLICY categories_admin_delete
  ON public.categories FOR DELETE TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)));

DROP POLICY products_public_read ON public.products;
DROP POLICY products_admin_manage ON public.products;
CREATE POLICY products_anon_read
  ON public.products FOR SELECT TO anon
  USING (publication_status = 'published'::public.publication_status);
CREATE POLICY products_authenticated_read
  ON public.products FOR SELECT TO authenticated
  USING (
    publication_status = 'published'::public.publication_status
    OR (SELECT private.has_role('admin'::public.app_role))
  );
CREATE POLICY products_admin_insert
  ON public.products FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_role('admin'::public.app_role)));
CREATE POLICY products_admin_update
  ON public.products FOR UPDATE TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)))
  WITH CHECK ((SELECT private.has_role('admin'::public.app_role)));
CREATE POLICY products_admin_delete
  ON public.products FOR DELETE TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)));

DROP POLICY product_images_public_read ON public.product_images;
DROP POLICY product_images_admin_manage ON public.product_images;
CREATE POLICY product_images_anon_read
  ON public.product_images FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.products AS p
    WHERE p.id = product_images.product_id
      AND p.publication_status = 'published'::public.publication_status
  ));
CREATE POLICY product_images_authenticated_read
  ON public.product_images FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products AS p
      WHERE p.id = product_images.product_id
        AND p.publication_status = 'published'::public.publication_status
    )
    OR (SELECT private.has_role('admin'::public.app_role))
  );
CREATE POLICY product_images_admin_insert
  ON public.product_images FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_role('admin'::public.app_role)));
CREATE POLICY product_images_admin_update
  ON public.product_images FOR UPDATE TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)))
  WITH CHECK ((SELECT private.has_role('admin'::public.app_role)));
CREATE POLICY product_images_admin_delete
  ON public.product_images FOR DELETE TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)));

DROP POLICY product_variants_public_read ON public.product_variants;
DROP POLICY product_variants_admin_manage ON public.product_variants;
CREATE POLICY product_variants_anon_read
  ON public.product_variants FOR SELECT TO anon
  USING (
    is_active
    AND EXISTS (
      SELECT 1 FROM public.products AS p
      WHERE p.id = product_variants.product_id
        AND p.publication_status = 'published'::public.publication_status
    )
  );
CREATE POLICY product_variants_authenticated_read
  ON public.product_variants FOR SELECT TO authenticated
  USING (
    (is_active AND EXISTS (
      SELECT 1 FROM public.products AS p
      WHERE p.id = product_variants.product_id
        AND p.publication_status = 'published'::public.publication_status
    ))
    OR (SELECT private.has_role('admin'::public.app_role))
  );
CREATE POLICY product_variants_admin_insert
  ON public.product_variants FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_role('admin'::public.app_role)));
CREATE POLICY product_variants_admin_update
  ON public.product_variants FOR UPDATE TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)))
  WITH CHECK ((SELECT private.has_role('admin'::public.app_role)));
CREATE POLICY product_variants_admin_delete
  ON public.product_variants FOR DELETE TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)));

DROP POLICY product_inventory_admin_write ON public.product_inventory;
CREATE POLICY product_inventory_admin_insert
  ON public.product_inventory FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_role('admin'::public.app_role)));
CREATE POLICY product_inventory_admin_update
  ON public.product_inventory FOR UPDATE TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)))
  WITH CHECK ((SELECT private.has_role('admin'::public.app_role)));
CREATE POLICY product_inventory_admin_delete
  ON public.product_inventory FOR DELETE TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)));

-- These wrappers do not need SECURITY DEFINER: role checks use the narrowly granted,
-- fixed-search-path private.has_role() helper, while table counts remain under RLS.
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.has_role('admin'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.admin_dashboard_summary()
RETURNS TABLE (
  total_products bigint,
  published_products bigint,
  active_categories bigint,
  pending_orders bigint,
  open_orders bigint,
  paid_delivered_value numeric
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.has_role('admin'::public.app_role) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Administrator access is required.';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT pg_catalog.count(*) FROM public.products),
    (SELECT pg_catalog.count(*) FROM public.products WHERE publication_status = 'published'::public.publication_status),
    (SELECT pg_catalog.count(*) FROM public.categories WHERE is_active),
    (SELECT pg_catalog.count(*) FROM public.orders WHERE order_status = 'pending'::public.order_status),
    (SELECT pg_catalog.count(*) FROM public.orders WHERE order_status IN ('pending'::public.order_status, 'confirmed'::public.order_status, 'processing'::public.order_status)),
    COALESCE((
      SELECT pg_catalog.sum(total)
      FROM public.orders
      WHERE order_status = 'delivered'::public.order_status
        AND payment_status = 'paid'::public.payment_status
    ), 0)::numeric;
END;
$$;

COMMIT;
