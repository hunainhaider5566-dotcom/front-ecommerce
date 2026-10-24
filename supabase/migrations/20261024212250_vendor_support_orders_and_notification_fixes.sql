-- Keep notifications compatible with the current notifications table shape.
CREATE OR REPLACE FUNCTION private.notify_order_delivered_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  buyer_user_id uuid;
BEGIN
  IF NEW.order_status = 'delivered' AND OLD.order_status IS DISTINCT FROM 'delivered' THEN
    SELECT u.id INTO buyer_user_id FROM auth.users AS u WHERE u.email = NEW.customer_email LIMIT 1;
    IF buyer_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, kind, title, body, related_order_id)
      VALUES (buyer_user_id, 'order'::public.notification_kind,
        'Order delivered — share your review',
        'Your order ' || NEW.order_number || ' has been delivered. You can now share a rating and review.', NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Sellers cannot use the same account to purchase their own listings.
CREATE OR REPLACE FUNCTION private.prevent_vendor_self_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  order_customer uuid;
  product_seller_user uuid;
BEGIN
  SELECT o.customer_id INTO order_customer FROM public.orders AS o WHERE o.id = NEW.order_id;
  IF NEW.seller_id IS NULL OR order_customer IS NULL THEN RETURN NEW; END IF;
  SELECT s.user_id INTO product_seller_user FROM public.seller_profiles AS s WHERE s.id = NEW.seller_id;
  IF product_seller_user = order_customer THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'You cannot place an order for your own product.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.prevent_vendor_self_purchase() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS prevent_vendor_self_purchase ON public.order_items;
CREATE TRIGGER prevent_vendor_self_purchase BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION private.prevent_vendor_self_purchase();

-- A support inbox for sellers, separate from buyer order cases.
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.seller_profiles(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 3 AND 180),
  message text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 3 AND 4000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  admin_response text CHECK (admin_response IS NULL OR char_length(admin_response) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
CREATE POLICY "Sellers and admins read support tickets" ON public.support_tickets FOR SELECT TO authenticated
  USING (public.current_user_is_admin() OR EXISTS (
    SELECT 1 FROM public.seller_profiles s WHERE s.id = support_tickets.seller_id AND s.user_id = (SELECT auth.uid())
  ));
CREATE POLICY "Sellers create their own support tickets" ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.seller_profiles s WHERE s.id = support_tickets.seller_id AND s.user_id = (SELECT auth.uid())
  ));
CREATE POLICY "Admins update support tickets" ON public.support_tickets FOR UPDATE TO authenticated
  USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());
CREATE INDEX support_tickets_status_created_at_idx ON public.support_tickets(status, created_at DESC);

CREATE OR REPLACE FUNCTION private.notify_admins_of_support_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE admin_user_id uuid;
BEGIN
  FOR admin_user_id IN SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'::public.app_role LOOP
    INSERT INTO public.notifications (user_id, kind, title, body)
    VALUES (admin_user_id, 'store'::public.notification_kind, 'New seller support ticket', NEW.subject);
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.notify_admins_of_support_ticket() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER support_ticket_admin_notification AFTER INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION private.notify_admins_of_support_ticket();
