-- Allow approved sellers to add images only to their own listings and storage folder.
CREATE POLICY product_images_vendor_insert
  ON public.product_images FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.products AS p
      JOIN public.seller_profiles AS s ON s.id = p.seller_id
      WHERE p.id = product_images.product_id
        AND s.user_id = (SELECT auth.uid())
        AND s.status = 'approved'
    )
  );

CREATE POLICY product_images_vendor_delete
  ON public.product_images FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.products AS p
      JOIN public.seller_profiles AS s ON s.id = p.seller_id
      WHERE p.id = product_images.product_id
        AND s.user_id = (SELECT auth.uid())
        AND s.status = 'approved'
    )
  );

CREATE POLICY product_images_storage_vendor_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1
      FROM public.products AS p
      JOIN public.seller_profiles AS s ON s.id = p.seller_id
      WHERE p.id::text = (storage.foldername(name))[2]
        AND s.user_id = (SELECT auth.uid())
        AND s.status = 'approved'
    )
  );

CREATE POLICY product_images_storage_vendor_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1
      FROM public.products AS p
      JOIN public.seller_profiles AS s ON s.id = p.seller_id
      WHERE p.id::text = (storage.foldername(name))[2]
        AND s.user_id = (SELECT auth.uid())
        AND s.status = 'approved'
    )
  );
