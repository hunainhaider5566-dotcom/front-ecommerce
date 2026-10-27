alter table public.promotions
  add column if not exists banner_image_urls text[] not null default '{}'::text[];

update public.promotions
set banner_image_urls = array[banner_image_url]
where banner_image_url is not null
  and cardinality(banner_image_urls) = 0;
