-- Paperloom Marketplace Phase 1 policy hardening.
-- Tightens the already-applied additive marketplace policies without changing buyer/admin ownership.

DROP POLICY products_vendor_read_own ON public.products;
CREATE POLICY products_vendor_read_own
  ON public.products FOR SELECT TO authenticated
  USING (seller_id IN (SELECT id FROM public.seller_profiles WHERE user_id = (SELECT auth.uid()) AND status = 'approved'));

DROP POLICY product_images_vendor_read_own ON public.product_images;
CREATE POLICY product_images_vendor_read_own
  ON public.product_images FOR SELECT TO authenticated
  USING (product_id IN (SELECT id FROM public.products WHERE seller_id IN (SELECT id FROM public.seller_profiles WHERE user_id = (SELECT auth.uid()) AND status = 'approved')));

DROP POLICY product_variants_vendor_read_own ON public.product_variants;
CREATE POLICY product_variants_vendor_read_own
  ON public.product_variants FOR SELECT TO authenticated
  USING (product_id IN (SELECT id FROM public.products WHERE seller_id IN (SELECT id FROM public.seller_profiles WHERE user_id = (SELECT auth.uid()) AND status = 'approved')));

DROP POLICY product_inventory_vendor_read_own ON public.product_inventory;
CREATE POLICY product_inventory_vendor_read_own
  ON public.product_inventory FOR SELECT TO authenticated
  USING (product_id IN (SELECT id FROM public.products WHERE seller_id IN (SELECT id FROM public.seller_profiles WHERE user_id = (SELECT auth.uid()) AND status = 'approved')));

DROP POLICY inventory_movements_vendor_read_own ON public.inventory_movements;
CREATE POLICY inventory_movements_vendor_read_own
  ON public.inventory_movements FOR SELECT TO authenticated
  USING (product_id IN (SELECT id FROM public.products WHERE seller_id IN (SELECT id FROM public.seller_profiles WHERE user_id = (SELECT auth.uid()) AND status = 'approved')));

DROP POLICY marketplace_cases_buyer_insert ON public.marketplace_cases;
CREATE POLICY marketplace_cases_buyer_insert
  ON public.marketplace_cases FOR INSERT TO authenticated
  WITH CHECK (
    buyer_id = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.customer_id = (SELECT auth.uid()))
    AND (order_item_id IS NULL OR EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.id = order_item_id AND oi.order_id = marketplace_cases.order_id))
    AND (seller_id IS NULL OR seller_id = (SELECT oi.seller_id FROM public.order_items oi WHERE oi.id = marketplace_cases.order_item_id))
  );

DROP POLICY product_drafts_storage_vendor_read ON storage.objects;
CREATE POLICY product_drafts_storage_vendor_read
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'product-drafts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text AND (SELECT private.has_role('vendor'::public.app_role)));
DROP POLICY product_drafts_storage_vendor_update ON storage.objects;
CREATE POLICY product_drafts_storage_vendor_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-drafts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text AND (SELECT private.has_role('vendor'::public.app_role)))
  WITH CHECK (bucket_id = 'product-drafts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text AND (SELECT private.has_role('vendor'::public.app_role)));
DROP POLICY product_drafts_storage_vendor_delete ON storage.objects;
CREATE POLICY product_drafts_storage_vendor_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-drafts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text AND (SELECT private.has_role('vendor'::public.app_role)));
