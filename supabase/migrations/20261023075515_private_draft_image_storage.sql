BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-drafts',
  'product-drafts',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY product_drafts_storage_admin_read
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'product-drafts'
    AND (SELECT private.has_role('admin'::public.app_role))
  );
CREATE POLICY product_drafts_storage_admin_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-drafts'
    AND (SELECT private.has_role('admin'::public.app_role))
  );
CREATE POLICY product_drafts_storage_admin_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-drafts'
    AND (SELECT private.has_role('admin'::public.app_role))
  )
  WITH CHECK (
    bucket_id = 'product-drafts'
    AND (SELECT private.has_role('admin'::public.app_role))
  );
CREATE POLICY product_drafts_storage_admin_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-drafts'
    AND (SELECT private.has_role('admin'::public.app_role))
  );

COMMIT;
