-- Service-role-only idempotency log prevents duplicate lifecycle emails.
CREATE TABLE public.email_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  event_type text NOT NULL,
  entity_id uuid NOT NULL,
  recipient_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

ALTER TABLE public.email_notification_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.email_notification_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_notification_events TO service_role;
