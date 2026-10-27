-- Keep suspension reasons private and manageable only through the admin edge function.
CREATE TABLE public.account_suspensions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 5 AND 1000),
  suspended_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  suspended_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.account_suspensions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_suspensions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.account_suspensions TO service_role;

CREATE OR REPLACE FUNCTION public.admin_account_suspensions()
RETURNS TABLE (user_id uuid, reason text, suspended_at timestamptz, suspended_by uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.has_role('admin'::public.app_role) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Administrator access is required.';
  END IF;
  RETURN QUERY SELECT s.user_id, s.reason, s.suspended_at, s.suspended_by
  FROM public.account_suspensions AS s
  ORDER BY s.suspended_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_account_suspensions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_account_suspensions() TO authenticated;
