BEGIN;

CREATE TABLE public.cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  variant_id uuid,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 99),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cart_items_variant_product_fk
    FOREIGN KEY (variant_id, product_id)
    REFERENCES public.product_variants (id, product_id)
    ON DELETE CASCADE,
  CONSTRAINT cart_items_user_product_variant_unique
    UNIQUE NULLS NOT DISTINCT (user_id, product_id, variant_id)
);

CREATE INDEX cart_items_user_updated_idx
  ON public.cart_items (user_id, updated_at DESC);

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.cart_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cart_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cart_items TO service_role;

CREATE POLICY cart_items_select_own
  ON public.cart_items FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY cart_items_insert_own_published
  ON public.cart_items FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = cart_items.product_id
        AND p.publication_status = 'published'::public.publication_status
    )
    AND (
      variant_id IS NULL OR EXISTS (
        SELECT 1 FROM public.product_variants v
        WHERE v.id = cart_items.variant_id
          AND v.product_id = cart_items.product_id
          AND v.is_active
      )
    )
  );

CREATE POLICY cart_items_update_own
  ON public.cart_items FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND quantity BETWEEN 1 AND 99
    AND EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = cart_items.product_id
        AND p.publication_status = 'published'::public.publication_status
    )
    AND (
      variant_id IS NULL OR EXISTS (
        SELECT 1 FROM public.product_variants v
        WHERE v.id = cart_items.variant_id
          AND v.product_id = cart_items.product_id
          AND v.is_active
      )
    )
  );

CREATE POLICY cart_items_delete_own
  ON public.cart_items FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE TRIGGER cart_items_touch_updated_at
  BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

COMMIT;
