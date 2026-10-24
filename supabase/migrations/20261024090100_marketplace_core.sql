-- Paperloom Marketplace Phase 1
-- Reviewed additive migration; no destructive table or data reset operations.

-- Paperloom Marketplace Phase 1
CREATE TYPE public.seller_status AS ENUM ('pending', 'approved', 'rejected', 'suspended');

CREATE TABLE public.seller_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  shop_name text NOT NULL CHECK (char_length(btrim(shop_name)) BETWEEN 2 AND 160),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  contact_email text CHECK (contact_email IS NULL OR contact_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  status public.seller_status NOT NULL DEFAULT 'pending',
  rejection_reason text CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 1000),
  reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.products
  ADD COLUMN seller_id uuid REFERENCES public.seller_profiles (id) ON DELETE SET NULL,
  ADD COLUMN moderation_status text NOT NULL DEFAULT 'approved' CHECK (moderation_status IN ('pending_review', 'approved', 'rejected', 'hidden', 'archived')),
  ADD COLUMN moderated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN moderated_at timestamptz,
  ADD COLUMN moderation_reason text CHECK (moderation_reason IS NULL OR char_length(moderation_reason) <= 1000),
  ADD COLUMN supplier_cost numeric(12, 2) CHECK (supplier_cost IS NULL OR supplier_cost >= 0),
  ADD COLUMN fulfillment_expense numeric(12, 2) NOT NULL DEFAULT 0 CHECK (fulfillment_expense >= 0),
  ADD COLUMN minimum_profit numeric(12, 2) NOT NULL DEFAULT 0 CHECK (minimum_profit >= 0),
  ADD COLUMN cost_updated_at timestamptz,
  ADD COLUMN stock_verification_status text NOT NULL DEFAULT 'unverified' CHECK (stock_verification_status IN ('unverified', 'verified', 'stale', 'paused'));

ALTER TABLE public.order_items
  ADD COLUMN seller_id uuid REFERENCES public.seller_profiles (id) ON DELETE SET NULL,
  ADD COLUMN seller_name_snapshot text,
  ADD COLUMN vendor_fulfillment_status text NOT NULL DEFAULT 'pending' CHECK (vendor_fulfillment_status IN ('pending', 'accepted', 'processing', 'shipped', 'delivered', 'cancelled')),
  ADD COLUMN tracking_number text,
  ADD COLUMN tracking_url text CHECK (tracking_url IS NULL OR tracking_url ~ '^https://'),
  ADD COLUMN vendor_note text CHECK (vendor_note IS NULL OR char_length(vendor_note) <= 1000),
  ADD COLUMN vendor_updated_at timestamptz;

DROP POLICY products_anon_read ON public.products;
DROP POLICY products_authenticated_read ON public.products;
CREATE POLICY products_anon_read
  ON public.products FOR SELECT TO anon
  USING (publication_status = 'published'::public.publication_status AND moderation_status = 'approved' AND stock_verification_status <> 'paused');
CREATE POLICY products_authenticated_read
  ON public.products FOR SELECT TO authenticated
  USING ((publication_status = 'published'::public.publication_status AND moderation_status = 'approved' AND stock_verification_status <> 'paused') OR (SELECT private.has_role('admin'::public.app_role)));

DROP POLICY product_images_anon_read ON public.product_images;
DROP POLICY product_images_authenticated_read ON public.product_images;
CREATE POLICY product_images_anon_read
  ON public.product_images FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_images.product_id AND p.publication_status = 'published'::public.publication_status AND p.moderation_status = 'approved' AND p.stock_verification_status <> 'paused'));
CREATE POLICY product_images_authenticated_read
  ON public.product_images FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_images.product_id AND p.publication_status = 'published'::public.publication_status AND p.moderation_status = 'approved' AND p.stock_verification_status <> 'paused') OR (SELECT private.has_role('admin'::public.app_role)));

DROP POLICY product_variants_anon_read ON public.product_variants;
DROP POLICY product_variants_authenticated_read ON public.product_variants;
CREATE POLICY product_variants_anon_read
  ON public.product_variants FOR SELECT TO anon
  USING (is_active AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_variants.product_id AND p.publication_status = 'published'::public.publication_status AND p.moderation_status = 'approved' AND p.stock_verification_status <> 'paused'));
CREATE POLICY product_variants_authenticated_read
  ON public.product_variants FOR SELECT TO authenticated
  USING ((is_active AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_variants.product_id AND p.publication_status = 'published'::public.publication_status AND p.moderation_status = 'approved' AND p.stock_verification_status <> 'paused')) OR (SELECT private.has_role('admin'::public.app_role)));
