CREATE OR REPLACE FUNCTION public.block_google_link_to_password_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.provider = 'google' AND EXISTS (
    SELECT 1
    FROM auth.identities AS existing
    WHERE existing.user_id = NEW.user_id
      AND existing.provider = 'email'
  ) THEN
    RAISE EXCEPTION 'google_signin_not_allowed_for_password_account';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.block_google_link_to_password_account() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS block_google_link_to_password_account ON auth.identities;
CREATE TRIGGER block_google_link_to_password_account
  BEFORE INSERT ON auth.identities
  FOR EACH ROW
  EXECUTE FUNCTION public.block_google_link_to_password_account();
