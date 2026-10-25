-- INSERT ... SELECT does not infer an enum target type for string literals.
-- Cast notification kinds explicitly in both RPCs that notify with SELECT.
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

  PERFORM 1 FROM public.order_items AS oi WHERE oi.order_id = order_row.id FOR UPDATE;

  IF order_row.order_status NOT IN ('pending'::public.order_status, 'confirmed'::public.order_status)
     OR order_row.payment_method <> 'cod'::public.payment_method
     OR order_row.payment_status <> 'pending'::public.payment_status THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This order can no longer be cancelled.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.order_items AS oi WHERE oi.order_id = order_row.id) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This order has no items to cancel.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.order_items AS oi WHERE oi.order_id = order_row.id
      AND oi.vendor_fulfillment_status NOT IN ('pending', 'accepted')) THEN
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

  UPDATE public.order_items SET vendor_fulfillment_status = 'cancelled', vendor_updated_at = pg_catalog.now()
  WHERE order_id = order_row.id;

  UPDATE public.orders SET order_status = 'cancelled'::public.order_status WHERE id = order_row.id;

  INSERT INTO public.notifications (user_id, kind, title, body, related_order_id)
  SELECT DISTINCT seller.user_id, 'order'::public.notification_kind,
         'Order ' || order_row.order_number || ' cancelled',
         'The customer cancelled this order before fulfilment started.', order_row.id
  FROM public.order_items AS item
  JOIN public.seller_profiles AS seller ON seller.id = item.seller_id
  WHERE item.order_id = order_row.id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_customer_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_customer_order(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.vendor_update_order_item(
  p_item_id uuid,
  p_status text,
  p_tracking_number text DEFAULT NULL,
  p_tracking_url text DEFAULT NULL,
  p_vendor_note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_status text;
  v_order_id uuid;
BEGIN
  SELECT oi.vendor_fulfillment_status, oi.order_id INTO current_status, v_order_id
  FROM public.order_items AS oi
  WHERE oi.id = p_item_id
    AND oi.seller_id IN (SELECT s.id FROM public.seller_profiles AS s
      WHERE s.user_id = (SELECT auth.uid()) AND s.status = 'approved')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Order item access was denied.';
  END IF;
  IF p_status NOT IN ('pending', 'accepted', 'processing', 'shipped', 'delivered', 'cancelled')
     OR (current_status = 'pending' AND p_status NOT IN ('accepted', 'cancelled'))
     OR (current_status = 'accepted' AND p_status NOT IN ('processing', 'cancelled'))
     OR (current_status = 'processing' AND p_status NOT IN ('shipped', 'cancelled'))
     OR (current_status = 'shipped' AND p_status <> 'delivered')
     OR current_status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid vendor fulfilment transition.';
  END IF;

  UPDATE public.order_items
  SET vendor_fulfillment_status = p_status, tracking_number = NULLIF(p_tracking_number, ''),
      tracking_url = NULLIF(p_tracking_url, ''), vendor_note = NULLIF(p_vendor_note, ''), vendor_updated_at = now()
  WHERE id = p_item_id;

  INSERT INTO public.notifications (user_id, kind, title, body, related_order_id)
  SELECT o.customer_id, 'order'::public.notification_kind, 'Order ' || o.order_number || ' fulfilment updated',
         'A seller updated an item to ' || p_status || '.', o.id
  FROM public.orders AS o WHERE o.id = v_order_id AND o.customer_id IS NOT NULL;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.vendor_update_order_item(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_update_order_item(uuid, text, text, text, text) TO authenticated;
