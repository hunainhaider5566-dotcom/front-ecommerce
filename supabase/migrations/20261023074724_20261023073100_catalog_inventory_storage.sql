BEGIN;

CREATE TYPE public.publication_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE public.inventory_movement_type AS ENUM ('initial', 'sale', 'restock', 'adjustment', 'return', 'correction');

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.categories (id) ON DELETE SET NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text NOT NULL DEFAULT '',
  eyebrow text,
  image_url text CHECK (image_url IS NULL OR image_url ~ '^https://'),
  is_active boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  seo_title text,
  seo_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.categories (id) ON DELETE SET NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 240),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sku text,
  short_description text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  price numeric(12, 2) NOT NULL CHECK (price >= 0),
  currency text NOT NULL DEFAULT 'PKR' CHECK (currency ~ '^[A-Z]{3}$'),
  specifications jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(specifications) = 'array'),
  publication_status public.publication_status NOT NULL DEFAULT 'draft',
  is_featured boolean NOT NULL DEFAULT false,
  track_inventory boolean NOT NULL DEFAULT true,
  weight_grams integer CHECK (weight_grams IS NULL OR weight_grams >= 0),
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dimensions) = 'object'),
  seo_title text,
  seo_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX products_sku_unique_idx
  ON public.products (sku)
  WHERE sku IS NOT NULL;
CREATE INDEX products_publication_category_idx
  ON public.products (publication_status, category_id, created_at DESC);
CREATE INDEX products_featured_publication_idx
  ON public.products (is_featured, publication_status, created_at DESC);
CREATE INDEX categories_active_sort_idx
  ON public.categories (is_active, sort_order, name);

CREATE TABLE public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  image_url text CHECK (image_url IS NULL OR image_url ~ '^https://'),
  storage_path text CHECK (storage_path IS NULL OR (storage_path !~ '^/' AND storage_path !~ '(^|/)\.\.?(/|$)')),
  alt_text text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_images_single_source_check CHECK ((image_url IS NOT NULL) <> (storage_path IS NOT NULL)),
  UNIQUE (product_id, sort_order)
);
CREATE UNIQUE INDEX product_images_one_primary_idx
  ON public.product_images (product_id)
  WHERE is_primary;
CREATE INDEX product_images_product_order_idx
  ON public.product_images (product_id, sort_order);

CREATE TABLE public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  option_label text NOT NULL CHECK (char_length(btrim(option_label)) BETWEEN 1 AND 80),
  option_value text NOT NULL CHECK (char_length(btrim(option_value)) BETWEEN 1 AND 120),
  sku text,
  price_override numeric(12, 2) CHECK (price_override IS NULL OR price_override >= 0),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, product_id),
  UNIQUE (product_id, option_label, option_value)
);
CREATE UNIQUE INDEX product_variants_sku_unique_idx
  ON public.product_variants (sku)
  WHERE sku IS NOT NULL;
CREATE INDEX product_variants_product_active_idx
  ON public.product_variants (product_id, is_active, sort_order);

CREATE TABLE public.product_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  variant_id uuid,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  low_stock_threshold integer CHECK (low_stock_threshold IS NULL OR low_stock_threshold >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_inventory_variant_product_fk
    FOREIGN KEY (variant_id, product_id)
    REFERENCES public.product_variants (id, product_id)
    ON DELETE CASCADE
);
CREATE UNIQUE INDEX product_inventory_one_product_idx
  ON public.product_inventory (product_id)
  WHERE variant_id IS NULL;
CREATE UNIQUE INDEX product_inventory_one_variant_idx
  ON public.product_inventory (variant_id)
  WHERE variant_id IS NOT NULL;
CREATE INDEX product_inventory_product_idx
  ON public.product_inventory (product_id);

CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  variant_id uuid REFERENCES public.product_variants (id) ON DELETE SET NULL,
  quantity_delta integer NOT NULL CHECK (quantity_delta <> 0),
  movement_type public.inventory_movement_type NOT NULL,
  reference_id uuid,
  note text,
  actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_movements_product_created_idx
  ON public.inventory_movements (product_id, created_at DESC);
CREATE INDEX inventory_movements_reference_idx
  ON public.inventory_movements (reference_id)
  WHERE reference_id IS NOT NULL;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.categories, public.products, public.product_images, public.product_variants, public.product_inventory, public.inventory_movements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.categories, public.products, public.product_images, public.product_variants TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.categories, public.products, public.product_images, public.product_variants TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.product_inventory TO authenticated;
GRANT SELECT ON TABLE public.inventory_movements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.categories, public.products, public.product_images, public.product_variants, public.product_inventory, public.inventory_movements TO service_role;

CREATE POLICY categories_public_read
  ON public.categories FOR SELECT TO anon, authenticated
  USING (is_active);
CREATE POLICY categories_admin_manage
  ON public.categories FOR ALL TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)))
  WITH CHECK ((SELECT private.has_role('admin'::public.app_role)));

CREATE POLICY products_public_read
  ON public.products FOR SELECT TO anon, authenticated
  USING (publication_status = 'published'::public.publication_status);
CREATE POLICY products_admin_manage
  ON public.products FOR ALL TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)))
  WITH CHECK ((SELECT private.has_role('admin'::public.app_role)));

CREATE POLICY product_images_public_read
  ON public.product_images FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products AS p
    WHERE p.id = product_images.product_id
      AND p.publication_status = 'published'::public.publication_status
  ));
CREATE POLICY product_images_admin_manage
  ON public.product_images FOR ALL TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)))
  WITH CHECK ((SELECT private.has_role('admin'::public.app_role)));

CREATE POLICY product_variants_public_read
  ON public.product_variants FOR SELECT TO anon, authenticated
  USING (
    is_active
    AND EXISTS (
      SELECT 1 FROM public.products AS p
      WHERE p.id = product_variants.product_id
        AND p.publication_status = 'published'::public.publication_status
    )
  );
CREATE POLICY product_variants_admin_manage
  ON public.product_variants FOR ALL TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)))
  WITH CHECK ((SELECT private.has_role('admin'::public.app_role)));

CREATE POLICY product_inventory_admin_read
  ON public.product_inventory FOR SELECT TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)));
CREATE POLICY product_inventory_admin_write
  ON public.product_inventory FOR ALL TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)))
  WITH CHECK ((SELECT private.has_role('admin'::public.app_role)));

CREATE POLICY inventory_movements_admin_read
  ON public.inventory_movements FOR SELECT TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)));

CREATE FUNCTION private.record_inventory_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  delta integer;
  movement public.inventory_movement_type;
  requested_type text;
  reference_value uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    delta := NEW.quantity;
    movement := 'initial'::public.inventory_movement_type;
  ELSE
    delta := NEW.quantity - OLD.quantity;
    movement := CASE WHEN delta > 0
      THEN 'restock'::public.inventory_movement_type
      ELSE 'adjustment'::public.inventory_movement_type
    END;
  END IF;

  IF delta = 0 THEN
    RETURN NEW;
  END IF;

  requested_type := NULLIF(pg_catalog.current_setting('paperloom.inventory_movement_type', true), '');
  IF requested_type IS NOT NULL AND requested_type IN ('initial', 'sale', 'restock', 'adjustment', 'return', 'correction') THEN
    movement := requested_type::public.inventory_movement_type;
  END IF;

  reference_value := NULLIF(pg_catalog.current_setting('paperloom.inventory_reference_id', true), '')::uuid;

  INSERT INTO public.inventory_movements (
    product_id, variant_id, quantity_delta, movement_type, reference_id, actor_id
  ) VALUES (
    NEW.product_id, NEW.variant_id, delta, movement, reference_value, (SELECT auth.uid())
  );

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.record_inventory_movement() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER categories_touch_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
CREATE TRIGGER products_touch_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
CREATE TRIGGER product_variants_touch_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
CREATE TRIGGER product_inventory_touch_updated_at
  BEFORE UPDATE ON public.product_inventory
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
CREATE TRIGGER product_inventory_record_movement
  AFTER INSERT OR UPDATE OF quantity ON public.product_inventory
  FOR EACH ROW EXECUTE FUNCTION private.record_inventory_movement();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]
);

CREATE POLICY product_images_storage_admin_read
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'product-images' AND (SELECT private.has_role('admin'::public.app_role)));
CREATE POLICY product_images_storage_admin_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND (SELECT private.has_role('admin'::public.app_role)));
CREATE POLICY product_images_storage_admin_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND (SELECT private.has_role('admin'::public.app_role)))
  WITH CHECK (bucket_id = 'product-images' AND (SELECT private.has_role('admin'::public.app_role)));
CREATE POLICY product_images_storage_admin_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND (SELECT private.has_role('admin'::public.app_role)));

COMMIT;
