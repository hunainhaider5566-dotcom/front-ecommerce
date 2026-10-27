-- Paperloom Marketplace Phase 1
-- Reviewed additive migration; no destructive table or data reset operations.

CREATE TABLE public.marketplace_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE RESTRICT,
  order_item_id uuid REFERENCES public.order_items (id) ON DELETE SET NULL,
  buyer_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  seller_id uuid REFERENCES public.seller_profiles (id) ON DELETE SET NULL,
  case_type text NOT NULL CHECK (case_type IN ('return', 'refund', 'complaint')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'seller_responded', 'under_review', 'approved', 'rejected', 'resolved')),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 2000),
  evidence_path text CHECK (evidence_path IS NULL OR (evidence_path !~ '^/' AND evidence_path !~ '(^|/)\.\.?(/|$)')),
  seller_response text CHECK (seller_response IS NULL OR char_length(seller_response) <= 2000),
  admin_decision text CHECK (admin_decision IS NULL OR char_length(admin_decision) <= 2000),
  decided_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX seller_profiles_status_idx ON public.seller_profiles (status, created_at DESC);
CREATE INDEX products_seller_moderation_idx ON public.products (seller_id, moderation_status, created_at DESC);
CREATE INDEX order_items_seller_status_idx ON public.order_items (seller_id, vendor_fulfillment_status, created_at DESC);
CREATE INDEX marketplace_cases_buyer_idx ON public.marketplace_cases (buyer_id, created_at DESC);
CREATE INDEX marketplace_cases_seller_idx ON public.marketplace_cases (seller_id, status, created_at DESC);

ALTER TABLE public.seller_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_cases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.seller_profiles, public.marketplace_cases FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.seller_profiles TO authenticated;
GRANT INSERT (user_id, shop_name, slug, description, contact_email) ON TABLE public.seller_profiles TO authenticated;
GRANT UPDATE (shop_name, slug, description, contact_email) ON TABLE public.seller_profiles TO authenticated;
GRANT SELECT, INSERT ON TABLE public.marketplace_cases TO authenticated;
GRANT UPDATE (status, seller_response) ON TABLE public.marketplace_cases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.seller_profiles, public.marketplace_cases TO service_role;

CREATE POLICY seller_profiles_own_read
  ON public.seller_profiles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT private.has_role('admin'::public.app_role)));
CREATE POLICY seller_profiles_own_apply
  ON public.seller_profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND status = 'pending' AND reviewed_by IS NULL);
CREATE POLICY seller_profiles_own_profile_update
  ON public.seller_profiles FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND status = 'approved')
  WITH CHECK (user_id = (SELECT auth.uid()) AND status = 'approved');
CREATE POLICY seller_profiles_admin_manage
  ON public.seller_profiles FOR ALL TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)))
  WITH CHECK ((SELECT private.has_role('admin'::public.app_role)));

CREATE POLICY products_vendor_read_own
  ON public.products FOR SELECT TO authenticated
  USING (seller_id IN (SELECT id FROM public.seller_profiles WHERE user_id = (SELECT auth.uid())));
CREATE POLICY product_images_vendor_read_own
  ON public.product_images FOR SELECT TO authenticated
  USING (product_id IN (SELECT id FROM public.products WHERE seller_id IN (SELECT id FROM public.seller_profiles WHERE user_id = (SELECT auth.uid()))));
CREATE POLICY product_variants_vendor_read_own
  ON public.product_variants FOR SELECT TO authenticated
  USING (product_id IN (SELECT id FROM public.products WHERE seller_id IN (SELECT id FROM public.seller_profiles WHERE user_id = (SELECT auth.uid()))));
CREATE POLICY product_inventory_vendor_read_own
  ON public.product_inventory FOR SELECT TO authenticated
  USING (product_id IN (SELECT id FROM public.products WHERE seller_id IN (SELECT id FROM public.seller_profiles WHERE user_id = (SELECT auth.uid()))));
CREATE POLICY inventory_movements_vendor_read_own
  ON public.inventory_movements FOR SELECT TO authenticated
  USING (product_id IN (SELECT id FROM public.products WHERE seller_id IN (SELECT id FROM public.seller_profiles WHERE user_id = (SELECT auth.uid()))));

CREATE POLICY marketplace_cases_buyer_read
  ON public.marketplace_cases FOR SELECT TO authenticated
  USING (buyer_id = (SELECT auth.uid()) OR (SELECT private.has_role('admin'::public.app_role)) OR seller_id IN (SELECT id FROM public.seller_profiles WHERE user_id = (SELECT auth.uid())));
CREATE POLICY marketplace_cases_buyer_insert
  ON public.marketplace_cases FOR INSERT TO authenticated
  WITH CHECK (buyer_id = (SELECT auth.uid()));
CREATE POLICY marketplace_cases_seller_update
  ON public.marketplace_cases FOR UPDATE TO authenticated
  USING (seller_id IN (SELECT id FROM public.seller_profiles WHERE user_id = (SELECT auth.uid())) AND status IN ('open', 'seller_responded'))
  WITH CHECK (seller_id IN (SELECT id FROM public.seller_profiles WHERE user_id = (SELECT auth.uid())) AND status IN ('seller_responded', 'under_review'));
CREATE POLICY marketplace_cases_admin_manage
  ON public.marketplace_cases FOR ALL TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)))
  WITH CHECK ((SELECT private.has_role('admin'::public.app_role)));
