-- Authenticated customer requests use a private, admin-managed support inbox.
CREATE TABLE public.customer_support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requester_name text NOT NULL CHECK (char_length(btrim(requester_name)) BETWEEN 1 AND 120),
  requester_email text NOT NULL CHECK (char_length(btrim(requester_email)) BETWEEN 3 AND 254),
  subject text NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 3 AND 180),
  message text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 10 AND 4000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  admin_response text CHECK (admin_response IS NULL OR char_length(admin_response) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_support_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_support_tickets FROM PUBLIC, anon;
GRANT SELECT, INSERT ON TABLE public.customer_support_tickets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_support_tickets TO service_role;

CREATE POLICY customer_support_tickets_owner_or_admin_read
  ON public.customer_support_tickets FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT private.has_role('admin'::public.app_role)));
CREATE POLICY customer_support_tickets_owner_insert
  ON public.customer_support_tickets FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND NOT (SELECT private.has_role('admin'::public.app_role)));
CREATE POLICY customer_support_tickets_admin_update
  ON public.customer_support_tickets FOR UPDATE TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)))
  WITH CHECK ((SELECT private.has_role('admin'::public.app_role)));

CREATE OR REPLACE FUNCTION private.assign_notification_audience()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.audience := CASE
    WHEN NEW.title IN ('New seller application', 'Product listing needs review', 'Marketplace case opened', 'New seller support ticket', 'New customer support ticket')
      OR (NEW.title LIKE 'New order %' AND NEW.title NOT LIKE 'New order for %') THEN 'admin'
    WHEN NEW.title LIKE 'New order for %' OR NEW.title LIKE 'Order % cancelled' THEN 'vendor'
    ELSE 'customer'
  END;
  RETURN NEW;
END;
$$;

CREATE INDEX customer_support_tickets_status_updated_idx
  ON public.customer_support_tickets(status, updated_at DESC);
CREATE INDEX customer_support_tickets_user_created_idx
  ON public.customer_support_tickets(user_id, created_at DESC);

-- Set requester identity server-side so the browser cannot submit a different user's email.
CREATE OR REPLACE FUNCTION private.set_customer_support_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'You can only create a support request for your own account.';
  END IF;
  SELECT COALESCE(NULLIF(btrim(p.full_name), ''), u.email), u.email
  INTO NEW.requester_name, NEW.requester_email
  FROM auth.users AS u
  LEFT JOIN public.profiles AS p ON p.id = u.id
  WHERE u.id = NEW.user_id;
  IF NEW.requester_email IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23502', MESSAGE = 'A verified account email is required for support.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.set_customer_support_identity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER customer_support_identity_before_insert
  BEFORE INSERT ON public.customer_support_tickets
  FOR EACH ROW EXECUTE FUNCTION private.set_customer_support_identity();

CREATE OR REPLACE FUNCTION private.notify_admins_of_customer_support_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE admin_user_id uuid;
BEGIN
  FOR admin_user_id IN
    SELECT ur.user_id FROM public.user_roles AS ur WHERE ur.role = 'admin'::public.app_role
  LOOP
    INSERT INTO public.notifications (user_id, kind, title, body, audience)
    VALUES (admin_user_id, 'store'::public.notification_kind, 'New customer support ticket', NEW.subject, 'admin');
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.notify_admins_of_customer_support_ticket() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER customer_support_ticket_admin_notification
  AFTER INSERT ON public.customer_support_tickets
  FOR EACH ROW EXECUTE FUNCTION private.notify_admins_of_customer_support_ticket();
