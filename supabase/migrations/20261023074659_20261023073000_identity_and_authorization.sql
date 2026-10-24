BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE TYPE public.app_role AS ENUM ('customer', 'admin');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name text CHECK (full_name IS NULL OR char_length(btrim(full_name)) BETWEEN 1 AND 150),
  phone text CHECK (phone IS NULL OR char_length(btrim(phone)) BETWEEN 7 AND 32),
  avatar_url text CHECK (avatar_url IS NULL OR avatar_url ~ '^https://'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, role)
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (full_name, phone, avatar_url) ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO service_role;

CREATE POLICY profiles_select_own
  ON public.profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.user_roles FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_roles TO service_role;

CREATE FUNCTION private.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

CREATE FUNCTION private.has_role(requested_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS role_row
    WHERE role_row.user_id = (SELECT auth.uid())
      AND role_row.role = requested_role
  );
$$;

REVOKE ALL ON FUNCTION private.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.has_role(public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(public.app_role) TO authenticated;

CREATE FUNCTION private.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  safe_name text;
BEGIN
  safe_name := NULLIF(pg_catalog.left(pg_catalog.btrim(COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')), 150), '');

  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, safe_name)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER profiles_touch_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.handle_new_auth_user();

COMMIT;
