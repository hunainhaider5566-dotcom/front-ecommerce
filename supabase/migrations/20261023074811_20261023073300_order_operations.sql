BEGIN;

CREATE TYPE public.order_status AS ENUM ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled');
CREATE TYPE public.payment_method AS ENUM ('unconfirmed', 'cod', 'card', 'bank_transfer');
CREATE TYPE public.payment_status AS ENUM ('pending', 'authorized', 'paid', 'failed', 'partially_refunded', 'refunded');
CREATE TYPE public.notification_kind AS ENUM ('order', 'account', 'store');

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE DEFAULT ('PL-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 12))),
  customer_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  customer_name text NOT NULL CHECK (char_length(btrim(customer_name)) BETWEEN 1 AND 150),
  customer_phone text NOT NULL CHECK (char_length(btrim(customer_phone)) BETWEEN 7 AND 32),
  customer_email text CHECK (customer_email IS NULL OR customer_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  shipping_address_snapshot jsonb NOT NULL CHECK (jsonb_typeof(shipping_address_snapshot) = 'object'),
  customer_note text CHECK (customer_note IS NULL OR char_length(customer_note) <= 1000),
  currency text NOT NULL DEFAULT 'PKR' CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal numeric(16, 2) NOT NULL CHECK (subtotal >= 0),
  delivery_fee numeric(16, 2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  discount_amount numeric(16, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0 AND discount_amount <= subtotal + delivery_fee),
  total numeric(16, 2) GENERATED ALWAYS AS (subtotal + delivery_fee - discount_amount) STORED,
  order_status public.order_status NOT NULL DEFAULT 'pending',
  payment_method public.payment_method NOT NULL DEFAULT 'unconfirmed',
  payment_status public.payment_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_customer_created_idx
  ON public.orders (customer_id, created_at DESC);
CREATE INDEX orders_status_created_idx
  ON public.orders (order_status, created_at DESC);
CREATE INDEX orders_payment_status_created_idx
  ON public.orders (payment_status, created_at DESC);

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products (id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.product_variants (id) ON DELETE SET NULL,
  product_name_snapshot text NOT NULL,
  sku_snapshot text,
  variant_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(variant_snapshot) = 'object'),
  product_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(product_snapshot) = 'object'),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  unit_price numeric(12, 2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(14, 2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_items_order_idx ON public.order_items (order_id);
CREATE INDEX order_items_product_idx ON public.order_items (product_id) WHERE product_id IS NOT NULL;

CREATE TABLE public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (char_length(btrim(provider)) BETWEEN 1 AND 80),
  provider_reference text,
  amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'PKR' CHECK (currency ~ '^[A-Z]{3}$'),
  status public.payment_status NOT NULL DEFAULT 'pending',
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_transactions_order_created_idx
  ON public.payment_transactions (order_id, created_at DESC);
CREATE UNIQUE INDEX payment_transactions_provider_reference_idx
  ON public.payment_transactions (provider, provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE TABLE public.admin_order_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE RESTRICT,
  note text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_order_notes_order_created_idx
  ON public.admin_order_notes (order_id, created_at DESC);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind public.notification_kind NOT NULL DEFAULT 'store',
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 180),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 2000),
  related_order_id uuid REFERENCES public.orders (id) ON DELETE SET NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

CREATE TABLE public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  entity text NOT NULL CHECK (char_length(btrim(entity)) BETWEEN 1 AND 80),
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_logs_entity_created_idx
  ON public.admin_audit_logs (entity, created_at DESC);
CREATE INDEX admin_audit_logs_actor_created_idx
  ON public.admin_audit_logs (actor_id, created_at DESC)
  WHERE actor_id IS NOT NULL;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_order_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.orders, public.order_items, public.payment_transactions, public.admin_order_notes, public.notifications, public.admin_audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.orders TO authenticated;
GRANT UPDATE (order_status, payment_status, payment_method) ON TABLE public.orders TO authenticated;
GRANT SELECT ON TABLE public.order_items, public.payment_transactions, public.admin_order_notes, public.admin_audit_logs TO authenticated;
GRANT INSERT, DELETE ON TABLE public.admin_order_notes TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.notifications TO authenticated;
GRANT UPDATE (read_at) ON TABLE public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.orders, public.order_items, public.payment_transactions, public.admin_order_notes, public.notifications, public.admin_audit_logs TO service_role;

CREATE POLICY orders_customer_or_admin_read
  ON public.orders FOR SELECT TO authenticated
  USING (
    customer_id = (SELECT auth.uid())
    OR (SELECT private.has_role('admin'::public.app_role))
  );
CREATE POLICY orders_admin_update
  ON public.orders FOR UPDATE TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)))
  WITH CHECK ((SELECT private.has_role('admin'::public.app_role)));

CREATE POLICY order_items_customer_or_admin_read
  ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders AS o
    WHERE o.id = order_items.order_id
      AND (
        o.customer_id = (SELECT auth.uid())
        OR (SELECT private.has_role('admin'::public.app_role))
      )
  ));

CREATE POLICY payment_transactions_admin_read
  ON public.payment_transactions FOR SELECT TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)));

CREATE POLICY admin_order_notes_admin_read
  ON public.admin_order_notes FOR SELECT TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)));
CREATE POLICY admin_order_notes_admin_insert
  ON public.admin_order_notes FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.has_role('admin'::public.app_role))
    AND created_by = (SELECT auth.uid())
  );
CREATE POLICY admin_order_notes_admin_update
  ON public.admin_order_notes FOR UPDATE TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)))
  WITH CHECK ((SELECT private.has_role('admin'::public.app_role)));
CREATE POLICY admin_order_notes_admin_delete
  ON public.admin_order_notes FOR DELETE TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)));

CREATE POLICY notifications_owner_read
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY notifications_owner_mark_read
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY notifications_admin_insert
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_role('admin'::public.app_role)));
CREATE POLICY notifications_admin_delete
  ON public.notifications FOR DELETE TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)));

CREATE POLICY admin_audit_logs_admin_read
  ON public.admin_audit_logs FOR SELECT TO authenticated
  USING ((SELECT private.has_role('admin'::public.app_role)));

CREATE TRIGGER orders_touch_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
CREATE TRIGGER payment_transactions_touch_updated_at
  BEFORE UPDATE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

COMMIT;
