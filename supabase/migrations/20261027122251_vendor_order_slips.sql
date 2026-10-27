-- Give approved sellers the minimum address data needed to dispatch their own
-- order lines and produce a printable packing slip.
DROP FUNCTION public.vendor_order_items();

CREATE FUNCTION public.vendor_order_items()
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
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT oi.id, oi.order_id, o.order_number, seller.shop_name,
         o.customer_name, o.customer_phone, o.shipping_address_snapshot,
         o.delivery_location_name, o.payment_method::text, o.created_at,
         oi.product_name_snapshot, oi.sku_snapshot, oi.variant_snapshot,
         oi.quantity, oi.unit_price, oi.line_total,
         oi.vendor_fulfillment_status::text, oi.tracking_number, oi.tracking_url,
         oi.vendor_note, oi.vendor_updated_at, oi.created_at
  FROM public.order_items AS oi
  JOIN public.orders AS o ON o.id = oi.order_id
  JOIN public.seller_profiles AS seller ON seller.id = oi.seller_id
  WHERE seller.user_id = (SELECT auth.uid())
    AND seller.status = 'approved';
$$;

REVOKE ALL ON FUNCTION public.vendor_order_items() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_order_items() TO authenticated;
