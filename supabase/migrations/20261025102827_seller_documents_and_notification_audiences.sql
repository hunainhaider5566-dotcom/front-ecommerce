-- Require private identity/business evidence for every application under review.
ALTER TABLE public.seller_profiles
  ADD CONSTRAINT seller_profiles_pending_requires_document_check
  CHECK (status <> 'pending'::public.seller_status OR document_path IS NOT NULL);

-- Keep admin, vendor and customer notifications in separate inboxes for users
-- who hold more than one marketplace role.
ALTER TABLE public.notifications
  ADD COLUMN audience text NOT NULL DEFAULT 'customer',
  ADD CONSTRAINT notifications_audience_check
    CHECK (audience IN ('customer', 'vendor', 'admin'));

UPDATE public.notifications
SET audience = CASE
  WHEN title IN ('New seller application', 'Product listing needs review', 'Marketplace case opened', 'New seller support ticket')
    OR (title LIKE 'New order %' AND title NOT LIKE 'New order for %') THEN 'admin'
  WHEN title LIKE 'New order for %' OR title LIKE 'Order % cancelled' THEN 'vendor'
  ELSE 'customer'
END;

CREATE OR REPLACE FUNCTION private.assign_notification_audience()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.audience := CASE
    WHEN NEW.title IN ('New seller application', 'Product listing needs review', 'Marketplace case opened', 'New seller support ticket')
      OR (NEW.title LIKE 'New order %' AND NEW.title NOT LIKE 'New order for %') THEN 'admin'
    WHEN NEW.title LIKE 'New order for %' OR NEW.title LIKE 'Order % cancelled' THEN 'vendor'
    ELSE 'customer'
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.assign_notification_audience() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER notifications_assign_audience
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION private.assign_notification_audience();
