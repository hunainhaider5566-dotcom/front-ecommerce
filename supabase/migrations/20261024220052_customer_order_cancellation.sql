CREATE OR REPLACE FUNCTION public.cancel_customer_order(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  order_row public.orders%ROWTYPE;
BEGIN
  SELECT * INTO order_row
  FROM public.orders AS o
  WHERE o.id = p_order_id
    AND o.customer_id = (SELECT auth.uid())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Order access was denied.';
  END IF;

  IF order_row.order_status NOT IN ('pending'::public.order_status, 'confirmed'::public.order_status)
     OR order_row.payment_method <> 'cod'::public.payment_method
     OR order_row.payment_status <> 'pending'::public.payment_status THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This order can no longer be cancelled.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.order_items AS oi WHERE oi.order_id = order_row.id) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This order has no items to cancel.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.order_items AS oi
    WHERE oi.order_id = order_row.id
      AND oi.vendor_fulfillment_status NOT IN ('pending', 'accepted')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Cancellation is unavailable after fulfilment has started.';
  END IF;

  PERFORM pg_catalog.set_config('paperloom.inventory_movement_type', 'return', true);
  PERFORM pg_catalog.set_config('paperloom.inventory_reference_id', order_row.id::text, true);
  PERFORM pg_catalog.set_config('paperloom.inventory_note', 'Customer cancelled order ' || order_row.order_number, true);

  UPDATE public.product_inventory AS inventory
  SET quantity = inventory.quantity + item.quantity
  FROM public.order_items AS item
  JOIN public.products AS product ON product.id = item.product_id AND product.track_inventory
  WHERE item.order_id = order_row.id
    AND inventory.product_id = item.product_id
    AND inventory.variant_id IS NOT DISTINCT FROM item.variant_id;

  UPDATE public.order_items
  SET vendor_fulfillment_status = 'cancelled', vendor_updated_at = pg_catalog.now()
  WHERE order_id = order_row.id;

  UPDATE public.orders
  SET order_status = 'cancelled'::public.order_status
  WHERE id = order_row.id;

  INSERT INTO public.notifications (user_id, kind, title, body, related_order_id)
  SELECT DISTINCT seller.user_id, 'order', 'Order ' || order_row.order_number || ' cancelled',
         'The customer cancelled this order before fulfilment started.', order_row.id
  FROM public.order_items AS item
  JOIN public.seller_profiles AS seller ON seller.id = item.seller_id
  WHERE item.order_id = order_row.id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_customer_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_customer_order(uuid) TO authenticated;
