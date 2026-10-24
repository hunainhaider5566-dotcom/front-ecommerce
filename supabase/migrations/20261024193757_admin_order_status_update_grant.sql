-- Let authenticated clients request order status transitions.
-- The orders_admin_update RLS policy limits rows to admins, and the existing
-- transition trigger validates each allowed status change.
GRANT UPDATE (order_status) ON TABLE public.orders TO authenticated;
