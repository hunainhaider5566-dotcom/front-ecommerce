-- Migration: 20261024132810_marketplace_heroes_promotions_complaints.sql
-- Description: Adds homepage heroes, promotional campaigns, buyer complaints, delivery coordinates, and private storage policies for vendor verification and evidence.

-- 1. Homepage Heroes Table
CREATE TABLE IF NOT EXISTS public.homepage_heroes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) > 0),
  subtitle text,
  cta_text text,
  cta_destination text,
  image_url text NOT NULL,
  mobile_image_url text,
  image_alt_text text,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  display_order integer NOT NULL DEFAULT 0,
  start_date timestamptz,
  end_date timestamptz,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.homepage_heroes ENABLE ROW LEVEL SECURITY;

CREATE POLICY homepage_heroes_public_read ON public.homepage_heroes
  FOR SELECT TO anon, authenticated
  USING (
    status = 'published' AND
    (start_date IS NULL OR start_date <= now()) AND
    (end_date IS NULL OR end_date >= now())
  );

CREATE POLICY homepage_heroes_admin_all ON public.homepage_heroes
  FOR ALL TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)))
  WITH CHECK ((SELECT private.has_role('admin'::public.app_role)));

-- 2. Promotions Table
CREATE TABLE IF NOT EXISTS public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) > 0),
  description text,
  banner_image_url text,
  cta_text text,
  cta_destination text,
  is_platform_wide boolean NOT NULL DEFAULT true,
  seller_id uuid REFERENCES public.seller_profiles (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected', 'hidden', 'archived')),
  rejection_reason text,
  reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  display_position text NOT NULL DEFAULT 'hero_banner' CHECK (display_position IN ('hero_banner', 'top_promo', 'category_feature', 'product_strip', 'offer_section')),
  priority integer NOT NULL DEFAULT 0,
  coupon_code text,
  discount_percent numeric(5, 2) CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100)),
  start_date timestamptz,
  end_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY promotions_public_read ON public.promotions
  FOR SELECT TO anon, authenticated
  USING (
    status = 'approved' AND
    (start_date IS NULL OR start_date <= now()) AND
    (end_date IS NULL OR end_date >= now())
  );

CREATE POLICY promotions_vendor_read_own ON public.promotions
  FOR SELECT TO authenticated
  USING (
    seller_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.seller_profiles s
      WHERE s.id = promotions.seller_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY promotions_vendor_insert_own ON public.promotions
  FOR INSERT TO authenticated
  WITH CHECK (
    is_platform_wide = false AND
    seller_id IS NOT NULL AND
    status = 'pending_review' AND
    EXISTS (
      SELECT 1 FROM public.seller_profiles s
      WHERE s.id = seller_id AND s.user_id = auth.uid() AND s.status = 'approved'
    )
  );

CREATE POLICY promotions_admin_all ON public.promotions
  FOR ALL TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)))
  WITH CHECK ((SELECT private.has_role('admin'::public.app_role)));

-- 3. Buyer Complaints and Returns Table
CREATE TABLE IF NOT EXISTS public.buyer_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_items (id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  seller_id uuid REFERENCES public.seller_profiles (id) ON DELETE SET NULL,
  case_type text NOT NULL DEFAULT 'complaint' CHECK (case_type IN ('return', 'refund', 'complaint', 'damaged', 'wrong_item')),
  reason text NOT NULL,
  description text NOT NULL,
  evidence_urls text[] NOT NULL DEFAULT '{}',
  seller_response text,
  seller_responded_at timestamptz,
  admin_decision text,
  admin_notes text,
  reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'seller_responded', 'under_review', 'approved', 'rejected', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.buyer_complaints ENABLE ROW LEVEL SECURITY;

CREATE POLICY buyer_complaints_buyer_read ON public.buyer_complaints
  FOR SELECT TO authenticated
  USING (buyer_id = auth.uid());

CREATE POLICY buyer_complaints_buyer_insert ON public.buyer_complaints
  FOR INSERT TO authenticated
  WITH CHECK (buyer_id = auth.uid());

CREATE POLICY buyer_complaints_seller_read ON public.buyer_complaints
  FOR SELECT TO authenticated
  USING (
    seller_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.seller_profiles s
      WHERE s.id = buyer_complaints.seller_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY buyer_complaints_seller_update ON public.buyer_complaints
  FOR UPDATE TO authenticated
  USING (
    seller_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.seller_profiles s
      WHERE s.id = buyer_complaints.seller_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY buyer_complaints_admin_all ON public.buyer_complaints
  FOR ALL TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)))
  WITH CHECK ((SELECT private.has_role('admin'::public.app_role)));

-- 4. Order Delivery Coordinates & Pin Snapshot
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_lat numeric(10, 7) CHECK (delivery_lat IS NULL OR (delivery_lat >= -90 AND delivery_lat <= 90)),
  ADD COLUMN IF NOT EXISTS delivery_lng numeric(10, 7) CHECK (delivery_lng IS NULL OR (delivery_lng >= -180 AND delivery_lng <= 180)),
  ADD COLUMN IF NOT EXISTS delivery_location_name text,
  ADD COLUMN IF NOT EXISTS delivery_location_captured_at timestamptz;

-- 5. Storage Buckets Configuration
INSERT INTO storage.buckets (id, name, public)
VALUES ('vendor-documents', 'vendor-documents', false),
       ('complaint-evidence', 'complaint-evidence', false)
ON CONFLICT (id) DO NOTHING;

-- Vendor documents bucket policies
CREATE POLICY "Vendor document upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vendor-documents');

CREATE POLICY "Vendor document owner or admin read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'vendor-documents' AND
    (
      (storage.foldername(name))[1] = auth.uid()::text OR
      (SELECT private.has_role('admin'::public.app_role))
    )
  );

-- Complaint evidence bucket policies
CREATE POLICY "Complaint evidence upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'complaint-evidence');

CREATE POLICY "Complaint evidence read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'complaint-evidence' AND
    (
      (storage.foldername(name))[1] = auth.uid()::text OR
      (SELECT private.has_role('admin'::public.app_role))
    )
  );
