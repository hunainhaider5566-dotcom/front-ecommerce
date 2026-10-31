BEGIN;

-- Vendor order RPCs must not be callable by anonymous users or PUBLIC.
-- The RPC bodies independently scope rows to auth.uid() and redact buyer PII.
REVOKE ALL ON FUNCTION public.vendor_order_items() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.vendor_order_items_page(integer, integer, text, text) FROM PUBLIC, anon;

-- Vendors can read only their own redacted order items; they cannot mutate
-- fulfillment state, tracking information, or vendor notes.
REVOKE ALL ON FUNCTION public.vendor_update_order_item(uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.vendor_order_items() TO authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_order_items_page(integer, integer, text, text) TO authenticated;

COMMIT;
