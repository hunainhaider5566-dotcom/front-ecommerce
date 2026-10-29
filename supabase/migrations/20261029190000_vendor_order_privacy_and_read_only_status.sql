BEGIN;

-- Vendor order views expose only the vendor's own product lines.
-- Keep the legacy return signature stable, but never return buyer contact,
-- address, location, payment, tracking, or free-text note fields to vendors.
CREATE OR REPLACE FUNCTION public.vendor_order_items()
RETURNS TABLE (
  id uuid,
  order_id uuid,
  order_number text,
  shop_name text,
  customer_name text,
  customer_phone text,
  shipping_address_snapshot jsonb,
  delivery_location_name text,
  payment_method text,
  order_created_at timestamptz,
  product_name_snapshot text,
  sku_snapshot text,
  variant_snapshot jsonb,
  quantity integer,
  unit_price numeric,
  line_total numeric,
  vendor_fulfillment_status text,
  tracking_number text,
  tracking_url text,
  vendor_note text,
  vendor_updated_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    oi.id, oi.order_id, o.order_number, seller.shop_name,
    NULL::text, NULL::text, NULL::jsonb, NULL::text, NULL::text,
    o.created_at, oi.product_name_snapshot, oi.sku_snapshot, oi.variant_snapshot,
    oi.quantity, oi.unit_price, oi.line_total,
    CASE
      WHEN o.order_status::text IN ('pending', 'confirmed') THEN 'pending'
      WHEN o.order_status::text = 'delivered' THEN 'delivered'
      WHEN o.order_status::text = 'cancelled' THEN 'cancelled'
      ELSE 'processing'
    END,
    NULL::text, NULL::text, NULL::text, oi.vendor_updated_at, oi.created_at
  FROM public.order_items AS oi
  JOIN public.orders AS o ON o.id = oi.order_id
  JOIN public.seller_profiles AS seller ON seller.id = oi.seller_id
  WHERE seller.user_id = (SELECT auth.uid())
    AND seller.status = 'approved';
$$;

DROP FUNCTION IF EXISTS public.vendor_order_items_page(integer, integer, text, text);

CREATE OR REPLACE FUNCTION public.vendor_order_items_page(
  p_limit integer DEFAULT 12,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  order_id uuid,
  order_number text,
  shop_name text,
  customer_name text,
  customer_phone text,
  shipping_address_snapshot jsonb,
  delivery_lat numeric,
  delivery_lng numeric,
  delivery_location_name text,
  payment_method text,
  order_created_at timestamptz,
  product_name_snapshot text,
  sku_snapshot text,
  variant_snapshot jsonb,
  quantity integer,
  unit_price numeric,
  line_total numeric,
  vendor_fulfillment_status text,
  tracking_number text,
  tracking_url text,
  vendor_note text,
  vendor_updated_at timestamptz,
  created_at timestamptz,
  total_orders bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  seller_id_value uuid;
  search_value text := NULLIF(pg_catalog.left(pg_catalog.btrim(p_search), 100), '');
  page_size integer := LEAST(15, GREATEST(1, COALESCE(p_limit, 12)));
  page_offset integer := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
  SELECT s.id INTO seller_id_value
  FROM public.seller_profiles AS s
  WHERE s.user_id = (SELECT auth.uid()) AND s.status = 'approved';

  IF seller_id_value IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'An approved seller account is required.';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('pending', 'delivered', 'not_delivered') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid delivery status filter.';
  END IF;

  RETURN QUERY
  WITH matched_orders AS (
    SELECT o.id, o.created_at
    FROM public.order_items AS oi
    JOIN public.orders AS o ON o.id = oi.order_id
    WHERE oi.seller_id = seller_id_value
      AND (
        p_status IS NULL
        OR (p_status = 'pending' AND o.order_status::text IN ('pending', 'confirmed'))
        OR (p_status = 'delivered' AND o.order_status::text = 'delivered')
        OR (p_status = 'not_delivered' AND o.order_status::text NOT IN ('delivered'))
      )
      AND (
        search_value IS NULL
        OR o.order_number ILIKE '%' || search_value || '%'
        OR EXISTS (
          SELECT 1
          FROM public.order_items AS searched_item
          WHERE searched_item.order_id = o.id
            AND searched_item.seller_id = seller_id_value
            AND searched_item.product_name_snapshot ILIKE '%' || search_value || '%'
        )
      )
    GROUP BY o.id, o.created_at
  ),
  paged_orders AS (
    SELECT matched_orders.id, matched_orders.created_at,
           pg_catalog.count(*) OVER () AS total_orders
    FROM matched_orders
    ORDER BY matched_orders.created_at DESC, matched_orders.id DESC
    LIMIT page_size OFFSET page_offset
  )
  SELECT
    oi.id, oi.order_id, o.order_number, seller.shop_name,
    NULL::text, NULL::text, NULL::jsonb, NULL::numeric, NULL::numeric, NULL::text, NULL::text,
    o.created_at, oi.product_name_snapshot, oi.sku_snapshot, oi.variant_snapshot,
    oi.quantity, oi.unit_price, oi.line_total,
    CASE
      WHEN o.order_status::text IN ('pending', 'confirmed') THEN 'pending'
      WHEN o.order_status::text = 'delivered' THEN 'delivered'
      WHEN o.order_status::text = 'cancelled' THEN 'cancelled'
      ELSE 'processing'
    END,
    NULL::text, NULL::text, NULL::text, oi.vendor_updated_at, oi.created_at,
    paged.total_orders
  FROM paged_orders AS paged
  JOIN public.orders AS o ON o.id = paged.id
  JOIN public.order_items AS oi ON oi.order_id = o.id AND oi.seller_id = seller_id_value
  JOIN public.seller_profiles AS seller ON seller.id = seller_id_value
  ORDER BY paged.created_at DESC, o.order_number DESC, oi.created_at ASC;
END;
$$;

-- Vendors can observe delivery state but cannot mutate fulfillment or tracking.
REVOKE ALL ON FUNCTION public.vendor_update_order_item(uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.vendor_order_items() TO authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_order_items_page(integer, integer, text, text) TO authenticated;

COMMIT;
