-- Meridion Marketplace: Reviews, Seller Uniqueness & Delivery Notifications

BEGIN;

-- 1. Ensure unique seller profile per user account
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'seller_profiles_user_id_key'
  ) THEN
    ALTER TABLE public.seller_profiles ADD CONSTRAINT seller_profiles_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- 2. Product Reviews Table
CREATE TABLE IF NOT EXISTS public.product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text CHECK (char_length(btrim(title)) <= 120),
  comment text CHECK (char_length(btrim(comment)) <= 2000),
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, product_id, buyer_id)
);

-- 3. Seller Reviews Table
CREATE TABLE IF NOT EXISTS public.seller_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.seller_profiles(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text CHECK (char_length(btrim(comment)) <= 2000),
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, seller_id, buyer_id)
);

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_reviews ENABLE ROW LEVEL SECURITY;

-- Product reviews RLS
DROP POLICY IF EXISTS product_reviews_public_read ON public.product_reviews;
CREATE POLICY product_reviews_public_read
  ON public.product_reviews FOR SELECT TO anon, authenticated
  USING (status = 'approved');

DROP POLICY IF EXISTS product_reviews_buyer_insert ON public.product_reviews;
CREATE POLICY product_reviews_buyer_insert
  ON public.product_reviews FOR INSERT TO authenticated
  WITH CHECK (
    buyer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.order_items oi ON oi.order_id = o.id
      WHERE o.id = product_reviews.order_id
        AND o.customer_email = (SELECT email FROM auth.users WHERE id = auth.uid())
        AND o.order_status = 'delivered'
        AND oi.product_id = product_reviews.product_id
    )
  );

-- Seller reviews RLS
DROP POLICY IF EXISTS seller_reviews_public_read ON public.seller_reviews;
CREATE POLICY seller_reviews_public_read
  ON public.seller_reviews FOR SELECT TO anon, authenticated
  USING (status = 'approved');

DROP POLICY IF EXISTS seller_reviews_buyer_insert ON public.seller_reviews;
CREATE POLICY seller_reviews_buyer_insert
  ON public.seller_reviews FOR INSERT TO authenticated
  WITH CHECK (
    buyer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.order_items oi ON oi.order_id = o.id
      WHERE o.id = seller_reviews.order_id
        AND o.customer_email = (SELECT email FROM auth.users WHERE id = auth.uid())
        AND o.order_status = 'delivered'
        AND oi.seller_id = seller_reviews.seller_id
    )
  );

-- 4. Automatic review notification trigger on order delivery
CREATE OR REPLACE FUNCTION private.notify_order_delivered_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  buyer_user_id uuid;
BEGIN
  IF NEW.order_status = 'delivered' AND (OLD.order_status IS NULL OR OLD.order_status <> 'delivered') THEN
    SELECT id INTO buyer_user_id
    FROM auth.users
    WHERE email = NEW.customer_email;

    IF buyer_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, link_path)
      VALUES (
        buyer_user_id,
        'Order Delivered — Share Your Review',
        'Your order ' || NEW.order_number || ' has been delivered! Share a rating and review for your purchased items.',
        '/account'
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_delivered_review_notify ON public.orders;
CREATE TRIGGER order_delivered_review_notify
  AFTER UPDATE OF order_status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.notify_order_delivered_review();

COMMIT;
