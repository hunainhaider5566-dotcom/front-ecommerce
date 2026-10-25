-- Shops opt in before a rounded location is returned by the public directory.
ALTER TABLE public.seller_profiles
  ADD COLUMN shop_lat numeric(9, 6),
  ADD COLUMN shop_lng numeric(9, 6),
  ADD COLUMN shop_location_label text NOT NULL DEFAULT '',
  ADD COLUMN show_shop_on_map boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT seller_profiles_shop_location_pair_check
    CHECK ((shop_lat IS NULL) = (shop_lng IS NULL)),
  ADD CONSTRAINT seller_profiles_shop_location_range_check
    CHECK (shop_lat IS NULL OR (shop_lat BETWEEN -90 AND 90 AND shop_lng BETWEEN -180 AND 180)),
  ADD CONSTRAINT seller_profiles_shop_map_opt_in_check
    CHECK (NOT show_shop_on_map OR (shop_lat IS NOT NULL AND shop_lng IS NOT NULL AND char_length(btrim(shop_location_label)) BETWEEN 2 AND 120));

GRANT UPDATE (shop_lat, shop_lng, shop_location_label, show_shop_on_map)
  ON public.seller_profiles TO authenticated;

DROP FUNCTION public.list_public_shops();
CREATE FUNCTION public.list_public_shops()
RETURNS TABLE (
  id uuid,
  shop_name text,
  slug text,
  description text,
  created_at timestamptz,
  product_count bigint,
  shop_image_url text,
  shop_location_label text,
  shop_lat double precision,
  shop_lng double precision
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
         s.shop_image_url,
         CASE WHEN s.show_shop_on_map THEN s.shop_location_label ELSE NULL END,
         CASE WHEN s.show_shop_on_map THEN pg_catalog.round(s.shop_lat, 2)::double precision ELSE NULL END,
         CASE WHEN s.show_shop_on_map THEN pg_catalog.round(s.shop_lng, 2)::double precision ELSE NULL END
  FROM public.seller_profiles AS s
  WHERE s.status = 'approved'
  ORDER BY s.shop_name;
$$;
REVOKE ALL ON FUNCTION public.list_public_shops() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_shops() TO anon, authenticated;
