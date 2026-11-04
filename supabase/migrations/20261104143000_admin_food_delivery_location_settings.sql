-- Admin-managed current operating location for JTBazar-owned food stock.
-- No fixed warehouse is assumed; the administrator can update the live location any time.
CREATE OR REPLACE FUNCTION public.admin_get_jtbazar_food_delivery_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_settings public.jtbazar_food_delivery_settings%ROWTYPE;
BEGIN
  IF NOT private.has_role('admin'::public.app_role) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Administrator access is required.';
  END IF;
  SELECT * INTO v_settings
  FROM public.jtbazar_food_delivery_settings
  WHERE singleton = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Food delivery settings are not initialized.';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'hub_lat', v_settings.hub_lat,
    'hub_lng', v_settings.hub_lng,
    'radius_km', v_settings.radius_km,
    'updated_at', v_settings.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_jtbazar_food_delivery_settings(
  p_hub_lat numeric,
  p_hub_lng numeric,
  p_radius_km numeric DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_settings public.jtbazar_food_delivery_settings%ROWTYPE;
BEGIN
  IF NOT private.has_role('admin'::public.app_role) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Administrator access is required.';
  END IF;
  IF (p_hub_lat IS NULL) <> (p_hub_lng IS NULL)
     OR (p_hub_lat IS NOT NULL AND (p_hub_lat < -90 OR p_hub_lat > 90))
     OR (p_hub_lng IS NOT NULL AND (p_hub_lng < -180 OR p_hub_lng > 180))
     OR p_radius_km IS NULL OR p_radius_km <= 0 OR p_radius_km > 50 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Enter valid latitude/longitude and a radius between 0 and 50 km.';
  END IF;

  UPDATE public.jtbazar_food_delivery_settings
  SET hub_lat = p_hub_lat,
      hub_lng = p_hub_lng,
      radius_km = p_radius_km,
      updated_at = now()
  WHERE singleton = true
  RETURNING * INTO v_settings;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Food delivery settings are not initialized.';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'hub_lat', v_settings.hub_lat,
    'hub_lng', v_settings.hub_lng,
    'radius_km', v_settings.radius_km,
    'updated_at', v_settings.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_jtbazar_food_delivery_settings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_jtbazar_food_delivery_settings(numeric,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_jtbazar_food_delivery_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_jtbazar_food_delivery_settings(numeric,numeric,numeric) TO authenticated;
