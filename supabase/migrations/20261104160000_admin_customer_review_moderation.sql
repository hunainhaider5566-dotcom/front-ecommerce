-- Admin-only customer product/shop review listing and moderation.
-- Rejected reviews are hidden from the storefront; approving them makes them visible again.

CREATE OR REPLACE FUNCTION public.admin_list_customer_reviews()
RETURNS TABLE (
  review_type text,
  review_id uuid,
  target_name text,
  buyer_name text,
  rating integer,
  title text,
  comment text,
  status text,
  order_number text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.has_role('admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  RETURN QUERY
  SELECT
    'product'::text,
    pr.id,
    p.name,
    COALESCE(NULLIF(btrim(prof.full_name), ''), 'Customer'),
    pr.rating,
    pr.title,
    pr.comment,
    pr.status,
    o.order_number,
    pr.created_at
  FROM public.product_reviews pr
  JOIN public.products p ON p.id = pr.product_id
  JOIN public.profiles prof ON prof.id = pr.buyer_id
  JOIN public.orders o ON o.id = pr.order_id

  UNION ALL

  SELECT
    'seller'::text,
    sr.id,
    sp.shop_name,
    COALESCE(NULLIF(btrim(prof.full_name), ''), 'Customer'),
    sr.rating,
    NULL::text,
    sr.comment,
    sr.status,
    o.order_number,
    sr.created_at
  FROM public.seller_reviews sr
  JOIN public.seller_profiles sp ON sp.id = sr.seller_id
  JOIN public.profiles prof ON prof.id = sr.buyer_id
  JOIN public.orders o ON o.id = sr.order_id
  ORDER BY created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_customer_review_status(
  p_review_type text,
  p_review_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected integer;
BEGIN
  IF NOT private.has_role('admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  IF p_status NOT IN ('approved', 'rejected', 'pending') THEN
    RAISE EXCEPTION 'Invalid review status';
  END IF;

  IF p_review_type = 'product' THEN
    UPDATE public.product_reviews
       SET status = p_status, updated_at = now()
     WHERE id = p_review_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
  ELSIF p_review_type = 'seller' THEN
    UPDATE public.seller_reviews
       SET status = p_status, updated_at = now()
     WHERE id = p_review_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
  ELSE
    RAISE EXCEPTION 'Invalid review type';
  END IF;

  IF affected = 0 THEN
    RAISE EXCEPTION 'Review not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_customer_reviews() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_customer_reviews() TO authenticated;
REVOKE ALL ON FUNCTION public.admin_set_customer_review_status(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_customer_review_status(text, uuid, text) TO authenticated;
