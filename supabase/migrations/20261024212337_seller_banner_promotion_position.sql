ALTER TABLE public.promotions DROP CONSTRAINT promotions_display_position_check;
ALTER TABLE public.promotions ADD CONSTRAINT promotions_display_position_check
  CHECK (display_position = ANY (ARRAY['hero_banner', 'top_promo', 'category_feature', 'product_strip', 'offer_section', 'seller_banner']));
