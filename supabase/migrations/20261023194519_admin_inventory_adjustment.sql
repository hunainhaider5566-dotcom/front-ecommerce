-- Canonical copy of the admin inventory adjustment migration.
-- Moves the previously admin-only migration into the storefront migration chain
-- so both applications share one ordered source of truth.

BEGIN;

CREATE OR REPLACE FUNCTION private.record_inventory_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  delta integer;
  movement public.inventory_movement_type;
  requested_type text;
  reference_value uuid;
  movement_note text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    delta := NEW.quantity;
    movement := 'initial'::public.inventory_movement_type;
  ELSE
    delta := NEW.quantity - OLD.quantity;
    movement := CASE WHEN delta > 0
      THEN 'restock'::public.inventory_movement_type
      ELSE 'adjustment'::public.inventory_movement_type
    END;
  END IF;

  IF delta = 0 THEN
    RETURN NEW;
  END IF;

  requested_type := NULLIF(pg_catalog.current_setting('paperloom.inventory_movement_type', true), '');
  IF requested_type IS NOT NULL AND requested_type IN ('initial', 'sale', 'restock', 'adjustment', 'return', 'correction') THEN
    movement := requested_type::public.inventory_movement_type;
  END IF;

  reference_value := NULLIF(pg_catalog.current_setting('paperloom.inventory_reference_id', true), '')::uuid;
  movement_note := NULLIF(pg_catalog.current_setting('paperloom.inventory_note', true), '');

  INSERT INTO public.inventory_movements (
    product_id, variant_id, quantity_delta, movement_type, reference_id, note, actor_id
  ) VALUES (
    NEW.product_id, NEW.variant_id, delta, movement, reference_value, movement_note, (SELECT auth.uid())
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.record_inventory_movement() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_adjust_inventory(
  p_inventory_id uuid,
  p_new_quantity integer,
  p_note text DEFAULT NULL
)
RETURNS public.product_inventory
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inventory_row public.product_inventory;
BEGIN
  IF NOT private.has_role('admin'::public.app_role) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Administrator access is required.';
  END IF;
  IF p_new_quantity IS NULL OR p_new_quantity < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Inventory quantity must be zero or greater.';
  END IF;
  IF p_note IS NOT NULL AND pg_catalog.char_length(p_note) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Inventory note is too long.';
  END IF;

  PERFORM pg_catalog.set_config('paperloom.inventory_movement_type', 'adjustment', true);
  PERFORM pg_catalog.set_config('paperloom.inventory_note', COALESCE(NULLIF(pg_catalog.btrim(p_note), ''), 'Admin adjustment'), true);

  UPDATE public.product_inventory
  SET quantity = p_new_quantity
  WHERE id = p_inventory_id
  RETURNING * INTO inventory_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Inventory record was not found.';
  END IF;
  RETURN inventory_row;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_inventory(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_inventory(uuid, integer, text) TO authenticated;

COMMIT;
