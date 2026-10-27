-- Paperloom Marketplace Phase 1
-- Reviewed additive migration; no destructive table or data reset operations.

CREATE FUNCTION private.touch_marketplace_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
REVOKE ALL ON FUNCTION private.touch_marketplace_updated_at() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER seller_profiles_touch_updated_at BEFORE UPDATE ON public.seller_profiles FOR EACH ROW EXECUTE FUNCTION private.touch_marketplace_updated_at();
CREATE TRIGGER marketplace_cases_touch_updated_at BEFORE UPDATE ON public.marketplace_cases FOR EACH ROW EXECUTE FUNCTION private.touch_marketplace_updated_at();

CREATE POLICY product_drafts_storage_vendor_read
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'product-drafts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY product_drafts_storage_vendor_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-drafts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text AND (SELECT private.has_role('vendor'::public.app_role)));
CREATE POLICY product_drafts_storage_vendor_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-drafts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'product-drafts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY product_drafts_storage_vendor_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-drafts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE FUNCTION private.enforce_marketplace_order_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE product_row public.products; seller_row public.seller_profiles;
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO product_row FROM public.products WHERE id = NEW.product_id;
  IF NOT FOUND OR product_row.publication_status <> 'published'::public.publication_status OR product_row.moderation_status <> 'approved' OR product_row.stock_verification_status = 'paused' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This product is not currently available for ordering.';
  END IF;
  IF product_row.seller_id IS NOT NULL THEN
    SELECT * INTO seller_row FROM public.seller_profiles WHERE id = product_row.seller_id;
    NEW.seller_id := seller_row.id;
    NEW.seller_name_snapshot := seller_row.shop_name;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_marketplace_order_item() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER order_items_marketplace_visibility BEFORE INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION private.enforce_marketplace_order_item();
