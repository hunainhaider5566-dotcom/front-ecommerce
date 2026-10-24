BEGIN;

CREATE TABLE public.customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  recipient_name text NOT NULL CHECK (char_length(btrim(recipient_name)) BETWEEN 1 AND 150),
  phone text NOT NULL CHECK (char_length(btrim(phone)) BETWEEN 7 AND 32),
  address_line_1 text NOT NULL CHECK (char_length(btrim(address_line_1)) BETWEEN 3 AND 240),
  address_line_2 text CHECK (address_line_2 IS NULL OR char_length(address_line_2) <= 240),
  city text NOT NULL CHECK (char_length(btrim(city)) BETWEEN 1 AND 120),
  province text,
  postal_code text,
  delivery_instructions text CHECK (delivery_instructions IS NULL OR char_length(delivery_instructions) <= 500),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_addresses_user_created_idx
  ON public.customer_addresses (user_id, created_at DESC);
CREATE UNIQUE INDEX customer_addresses_one_default_per_user_idx
  ON public.customer_addresses (user_id)
  WHERE is_default;

CREATE TABLE public.wishlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  variant_id uuid,
  added_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wishlist_variant_product_fk
    FOREIGN KEY (variant_id, product_id)
    REFERENCES public.product_variants (id, product_id)
    ON DELETE CASCADE
);
CREATE UNIQUE INDEX wishlist_user_product_default_variant_idx
  ON public.wishlist_items (user_id, product_id)
  WHERE variant_id IS NULL;
CREATE UNIQUE INDEX wishlist_user_variant_idx
  ON public.wishlist_items (user_id, variant_id)
  WHERE variant_id IS NOT NULL;
CREATE INDEX wishlist_items_user_added_idx
  ON public.wishlist_items (user_id, added_at DESC);

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.customer_addresses, public.wishlist_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_addresses TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.wishlist_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_addresses, public.wishlist_items TO service_role;

CREATE POLICY customer_addresses_select_own
  ON public.customer_addresses FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY customer_addresses_insert_own
  ON public.customer_addresses FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY customer_addresses_update_own
  ON public.customer_addresses FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY customer_addresses_delete_own
  ON public.customer_addresses FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY wishlist_items_select_own
  ON public.wishlist_items FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY wishlist_items_insert_own_published
  ON public.wishlist_items FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.products AS p
      WHERE p.id = wishlist_items.product_id
        AND p.publication_status = 'published'::public.publication_status
    )
    AND (
      variant_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.product_variants AS v
        WHERE v.id = wishlist_items.variant_id
          AND v.product_id = wishlist_items.product_id
          AND v.is_active
      )
    )
  );
CREATE POLICY wishlist_items_delete_own
  ON public.wishlist_items FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE TRIGGER customer_addresses_touch_updated_at
  BEFORE UPDATE ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

COMMIT;
