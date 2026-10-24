-- Public shop imagery and admin activity notifications.

ALTER TABLE public.seller_profiles
  ADD COLUMN shop_image_url text;

GRANT INSERT (user_id, shop_name, slug, description, contact_email, phone, document_path, shop_image_url)
  ON TABLE public.seller_profiles TO authenticated;
GRANT UPDATE (shop_name, slug, description, contact_email, phone, document_path, shop_image_url)
  ON TABLE public.seller_profiles TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('shop-images', 'shop-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY shop_images_public_read
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'shop-images');
CREATE POLICY shop_images_vendor_insert_own
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'shop-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.seller_profiles AS s
      WHERE s.user_id = (SELECT auth.uid())
        AND s.status IN ('pending', 'approved', 'rejected')
    )
  );
CREATE POLICY shop_images_vendor_update_own
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'shop-images' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'shop-images' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY shop_images_vendor_delete_own
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'shop-images' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

DROP FUNCTION public.list_public_shops();
CREATE FUNCTION public.list_public_shops()
RETURNS TABLE (
  id uuid,
  shop_name text,
  slug text,
  description text,
  created_at timestamptz,
  product_count bigint,
  shop_image_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.id, s.shop_name, s.slug, s.description, s.created_at,
         (SELECT pg_catalog.count(*)
          FROM public.products AS p
          WHERE p.seller_id = s.id
            AND p.publication_status = 'published'::public.publication_status
            AND p.moderation_status = 'approved'
            AND p.stock_verification_status <> 'paused'),
         s.shop_image_url
  FROM public.seller_profiles AS s
  WHERE s.status = 'approved'
  ORDER BY s.shop_name;
$$;
REVOKE ALL ON FUNCTION public.list_public_shops() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_shops() TO anon, authenticated;

CREATE OR REPLACE FUNCTION private.notify_admins_of_marketplace_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  admin_user_id uuid;
  notification_kind public.notification_kind := 'store';
  notification_title text;
  notification_body text;
  notification_order_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'seller_profiles' THEN
    notification_title := 'New seller application';
    notification_body := NEW.shop_name || ' submitted a shop for review.';
  ELSIF TG_TABLE_NAME = 'products' THEN
    notification_title := 'Product listing needs review';
    notification_body := NEW.name || ' was submitted for moderation.';
  ELSIF TG_TABLE_NAME = 'orders' THEN
    notification_kind := 'order';
    notification_title := 'New order ' || NEW.order_number;
    notification_body := 'A new order was placed and is ready for fulfilment.';
    notification_order_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'marketplace_cases' THEN
    notification_title := 'Marketplace case opened';
    notification_body := 'A buyer opened a ' || NEW.case_type || ' case for review.';
    notification_order_id := NEW.order_id;
  ELSE
    RETURN NEW;
  END IF;

  FOR admin_user_id IN
    SELECT ur.user_id FROM public.user_roles AS ur WHERE ur.role = 'admin'::public.app_role
  LOOP
    INSERT INTO public.notifications (user_id, kind, title, body, related_order_id)
    VALUES (admin_user_id, notification_kind, notification_title, notification_body, notification_order_id);
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.notify_admins_of_marketplace_activity() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER seller_application_admin_notification
  AFTER INSERT ON public.seller_profiles
  FOR EACH ROW WHEN (NEW.status = 'pending'::public.seller_status)
  EXECUTE FUNCTION private.notify_admins_of_marketplace_activity();

CREATE TRIGGER vendor_product_admin_notification
  AFTER INSERT ON public.products
  FOR EACH ROW WHEN (NEW.seller_id IS NOT NULL AND NEW.moderation_status = 'pending_review')
  EXECUTE FUNCTION private.notify_admins_of_marketplace_activity();

CREATE TRIGGER vendor_product_resubmission_admin_notification
  AFTER UPDATE OF moderation_status ON public.products
  FOR EACH ROW WHEN (
    NEW.seller_id IS NOT NULL
    AND NEW.moderation_status = 'pending_review'
    AND OLD.moderation_status IS DISTINCT FROM NEW.moderation_status
  ) EXECUTE FUNCTION private.notify_admins_of_marketplace_activity();

CREATE TRIGGER new_order_admin_notification
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.notify_admins_of_marketplace_activity();

CREATE TRIGGER marketplace_case_admin_notification
  AFTER INSERT ON public.marketplace_cases
  FOR EACH ROW EXECUTE FUNCTION private.notify_admins_of_marketplace_activity();
