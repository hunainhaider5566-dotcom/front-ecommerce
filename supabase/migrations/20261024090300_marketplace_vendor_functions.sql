-- Paperloom Marketplace Phase 1
-- Reviewed additive migration; no destructive table or data reset operations.

CREATE FUNCTION public.vendor_create_product(
  p_category_id uuid,
  p_name text,
  p_slug text,
  p_sku text,
  p_short_description text,
  p_description text,
  p_price numeric,
  p_supplier_cost numeric,
  p_fulfillment_expense numeric,
  p_minimum_profit numeric,
  p_track_inventory boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE seller public.seller_profiles; product_id uuid;
BEGIN
  SELECT * INTO seller FROM public.seller_profiles WHERE user_id = (SELECT auth.uid()) AND status = 'approved' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'An approved seller account is required.'; END IF;
  IF p_price < COALESCE(p_supplier_cost, 0) + COALESCE(p_fulfillment_expense, 0) + COALESCE(p_minimum_profit, 0) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Selling price does not meet the minimum profit rule.';
  END IF;
  INSERT INTO public.products (seller_id, category_id, name, slug, sku, short_description, description, price, supplier_cost, fulfillment_expense, minimum_profit, cost_updated_at, track_inventory, publication_status, moderation_status)
  VALUES (seller.id, p_category_id, p_name, p_slug, NULLIF(p_sku, ''), COALESCE(p_short_description, ''), COALESCE(p_description, ''), p_price, p_supplier_cost, COALESCE(p_fulfillment_expense, 0), COALESCE(p_minimum_profit, 0), now(), COALESCE(p_track_inventory, true), 'draft', 'pending_review')
  RETURNING id INTO product_id;
  RETURN product_id;
END;
$$;
REVOKE ALL ON FUNCTION public.vendor_create_product(uuid, text, text, text, text, text, numeric, numeric, numeric, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_create_product(uuid, text, text, text, text, text, numeric, numeric, numeric, numeric, boolean) TO authenticated;

CREATE FUNCTION public.vendor_adjust_inventory(p_inventory_id uuid, p_new_quantity integer, p_note text)
RETURNS public.product_inventory
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE result_row public.product_inventory;
  old_quantity integer;
BEGIN
  IF p_new_quantity < 0 THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Quantity cannot be negative.'; END IF;
  SELECT i.quantity INTO old_quantity
  FROM public.product_inventory i
  WHERE i.id = p_inventory_id
    AND EXISTS (SELECT 1 FROM public.products p JOIN public.seller_profiles s ON s.id = p.seller_id WHERE p.id = i.product_id AND s.user_id = (SELECT auth.uid()) AND s.status = 'approved')
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Inventory access was denied.'; END IF;
  UPDATE public.product_inventory i
  SET quantity = p_new_quantity, updated_at = now()
  WHERE i.id = p_inventory_id
  RETURNING i.* INTO result_row;
  IF p_new_quantity <> old_quantity THEN
    INSERT INTO public.inventory_movements (product_id, quantity_delta, movement_type, note, actor_id)
    SELECT i.product_id, p_new_quantity - old_quantity, 'adjustment'::public.inventory_movement_type, NULLIF(p_note, ''), (SELECT auth.uid())
    FROM public.product_inventory i WHERE i.id = p_inventory_id;
  END IF;
  RETURN result_row;
END;
$$;
REVOKE ALL ON FUNCTION public.vendor_adjust_inventory(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_adjust_inventory(uuid, integer, text) TO authenticated;

CREATE FUNCTION public.vendor_update_product(
  p_product_id uuid,
  p_name text,
  p_slug text,
  p_sku text,
  p_short_description text,
  p_description text,
  p_price numeric,
  p_supplier_cost numeric,
  p_fulfillment_expense numeric,
  p_minimum_profit numeric
)
RETURNS public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE result_row public.products;
BEGIN
  IF p_price < COALESCE(p_supplier_cost, 0) + COALESCE(p_fulfillment_expense, 0) + COALESCE(p_minimum_profit, 0) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Selling price does not meet the minimum profit rule.';
  END IF;
  UPDATE public.products p SET name = p_name, slug = p_slug, sku = NULLIF(p_sku, ''), short_description = COALESCE(p_short_description, ''), description = COALESCE(p_description, ''), price = p_price, supplier_cost = p_supplier_cost, fulfillment_expense = COALESCE(p_fulfillment_expense, 0), minimum_profit = COALESCE(p_minimum_profit, 0), cost_updated_at = now(), moderation_status = 'pending_review', publication_status = 'draft', updated_at = now()
  WHERE p.id = p_product_id AND p.seller_id IN (SELECT s.id FROM public.seller_profiles s WHERE s.user_id = (SELECT auth.uid()) AND s.status = 'approved')
  RETURNING p.* INTO result_row;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Product access was denied.'; END IF;
  RETURN result_row;
END;
$$;
REVOKE ALL ON FUNCTION public.vendor_update_product(uuid, text, text, text, text, text, numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_update_product(uuid, text, text, text, text, text, numeric, numeric, numeric, numeric) TO authenticated;

CREATE FUNCTION public.admin_moderate_product(p_product_id uuid, p_status text, p_reason text DEFAULT NULL)
RETURNS public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE result_row public.products;
BEGIN
  IF NOT private.has_role('admin'::public.app_role) THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Administrator access is required.'; END IF;
  IF p_status NOT IN ('pending_review', 'approved', 'rejected', 'hidden', 'archived') THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid moderation status.'; END IF;
  UPDATE public.products SET moderation_status = p_status, moderation_reason = NULLIF(p_reason, ''), moderated_by = (SELECT auth.uid()), moderated_at = now(), publication_status = CASE WHEN p_status IN ('approved') THEN publication_status ELSE 'draft'::public.publication_status END, updated_at = now() WHERE id = p_product_id RETURNING * INTO result_row;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Product was not found.'; END IF;
  INSERT INTO public.admin_audit_logs (actor_id, action, entity, entity_id, details) VALUES ((SELECT auth.uid()), 'UPDATE', 'products', result_row.id, jsonb_build_object('moderation_status', p_status, 'reason', p_reason));
  RETURN result_row;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_moderate_product(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_moderate_product(uuid, text, text) TO authenticated;

CREATE FUNCTION public.admin_review_seller(p_seller_id uuid, p_status public.seller_status, p_reason text DEFAULT NULL)
RETURNS public.seller_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE result_row public.seller_profiles;
BEGIN
  IF NOT private.has_role('admin'::public.app_role) THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Administrator access is required.'; END IF;
  IF p_status NOT IN ('approved', 'rejected', 'suspended') THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid seller review status.'; END IF;
  UPDATE public.seller_profiles SET status = p_status, rejection_reason = NULLIF(p_reason, ''), reviewed_by = (SELECT auth.uid()), reviewed_at = now(), updated_at = now() WHERE id = p_seller_id RETURNING * INTO result_row;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Seller application was not found.'; END IF;
  IF result_row.user_id = (SELECT auth.uid()) THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Self-approval is not permitted.'; END IF;
  INSERT INTO public.admin_audit_logs (actor_id, action, entity, entity_id, details) VALUES ((SELECT auth.uid()), 'UPDATE', 'seller_profiles', result_row.id, jsonb_build_object('status', p_status, 'reason', p_reason));
  IF p_status = 'approved' THEN
    INSERT INTO public.user_roles (user_id, role, assigned_by) VALUES (result_row.user_id, 'vendor'::public.app_role, (SELECT auth.uid())) ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = result_row.user_id AND role = 'vendor'::public.app_role;
  END IF;
  RETURN result_row;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_review_seller(uuid, public.seller_status, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_seller(uuid, public.seller_status, text) TO authenticated;

CREATE FUNCTION public.admin_decide_marketplace_case(p_case_id uuid, p_status text, p_decision text)
RETURNS public.marketplace_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE result_row public.marketplace_cases;
BEGIN
  IF NOT private.has_role('admin'::public.app_role) THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Administrator access is required.'; END IF;
  IF p_status NOT IN ('approved', 'rejected', 'resolved') THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid marketplace case decision.'; END IF;
  UPDATE public.marketplace_cases SET status = p_status, admin_decision = NULLIF(p_decision, ''), decided_by = (SELECT auth.uid()), decided_at = now(), updated_at = now() WHERE id = p_case_id RETURNING * INTO result_row;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Marketplace case was not found.'; END IF;
  INSERT INTO public.admin_audit_logs (actor_id, action, entity, entity_id, details) VALUES ((SELECT auth.uid()), 'UPDATE', 'marketplace_cases', result_row.id, jsonb_build_object('status', p_status, 'decision', p_decision));
  RETURN result_row;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_decide_marketplace_case(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decide_marketplace_case(uuid, text, text) TO authenticated;

CREATE FUNCTION public.vendor_order_items()
RETURNS TABLE (id uuid, order_id uuid, order_number text, product_name_snapshot text, sku_snapshot text, variant_snapshot jsonb, quantity integer, unit_price numeric, line_total numeric, vendor_fulfillment_status text, tracking_number text, tracking_url text, vendor_note text, vendor_updated_at timestamptz, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT oi.id, oi.order_id, o.order_number, oi.product_name_snapshot, oi.sku_snapshot, oi.variant_snapshot, oi.quantity, oi.unit_price, oi.line_total, oi.vendor_fulfillment_status, oi.tracking_number, oi.tracking_url, oi.vendor_note, oi.vendor_updated_at, oi.created_at
  FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.seller_id IN (SELECT s.id FROM public.seller_profiles s WHERE s.user_id = (SELECT auth.uid()) AND s.status = 'approved');
$$;
REVOKE ALL ON FUNCTION public.vendor_order_items() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_order_items() TO authenticated;

CREATE FUNCTION public.vendor_update_order_item(p_item_id uuid, p_status text, p_tracking_number text DEFAULT NULL, p_tracking_url text DEFAULT NULL, p_vendor_note text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE current_status text;
BEGIN
  SELECT vendor_fulfillment_status INTO current_status FROM public.order_items oi WHERE oi.id = p_item_id AND oi.seller_id IN (SELECT s.id FROM public.seller_profiles s WHERE s.user_id = (SELECT auth.uid()) AND s.status = 'approved') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Order item access was denied.'; END IF;
  IF p_status NOT IN ('pending', 'accepted', 'processing', 'shipped', 'delivered', 'cancelled') OR (current_status = 'pending' AND p_status NOT IN ('accepted', 'cancelled')) OR (current_status = 'accepted' AND p_status NOT IN ('processing', 'cancelled')) OR (current_status = 'processing' AND p_status NOT IN ('shipped', 'cancelled')) OR (current_status = 'shipped' AND p_status <> 'delivered') OR current_status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid vendor fulfilment transition.';
  END IF;
  UPDATE public.order_items SET vendor_fulfillment_status = p_status, tracking_number = NULLIF(p_tracking_number, ''), tracking_url = NULLIF(p_tracking_url, ''), vendor_note = NULLIF(p_vendor_note, ''), vendor_updated_at = now() WHERE id = p_item_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.vendor_update_order_item(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_update_order_item(uuid, text, text, text, text) TO authenticated;
