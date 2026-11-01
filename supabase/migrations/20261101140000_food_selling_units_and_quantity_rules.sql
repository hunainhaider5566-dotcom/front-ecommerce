-- Food & Groceries selling units, quantity increments and daily inventory integration.
-- Product.price stores the price per customer-selected increment for checkout math.
-- food_unit_price stores the display price per configured selling unit (e.g. PKR/kg).

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS food_selling_unit text,
  ADD COLUMN IF NOT EXISTS food_unit_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS food_quantity_increment integer,
  ADD COLUMN IF NOT EXISTS food_minimum_quantity integer;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_food_selling_unit_check,
  DROP CONSTRAINT IF EXISTS products_food_quantity_increment_check,
  DROP CONSTRAINT IF EXISTS products_food_minimum_quantity_check,
  DROP CONSTRAINT IF EXISTS products_food_unit_fields_consistent_check,
  DROP CONSTRAINT IF EXISTS products_food_unit_price_nonnegative,
  DROP CONSTRAINT IF EXISTS products_food_fields_complete_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_food_selling_unit_check
    CHECK (food_selling_unit IS NULL OR food_selling_unit IN ('kg','g','l','ml','piece','dozen','pack')),
  ADD CONSTRAINT products_food_quantity_increment_check
    CHECK (food_quantity_increment IS NULL OR food_quantity_increment > 0),
  ADD CONSTRAINT products_food_minimum_quantity_check
    CHECK (food_minimum_quantity IS NULL OR food_minimum_quantity > 0),
  ADD CONSTRAINT products_food_unit_price_nonnegative
    CHECK (food_unit_price IS NULL OR food_unit_price >= 0),
  ADD CONSTRAINT products_food_fields_complete_check
    CHECK (
      (food_selling_unit IS NULL AND food_unit_price IS NULL AND food_quantity_increment IS NULL AND food_minimum_quantity IS NULL)
      OR
      (food_selling_unit IS NOT NULL AND food_unit_price IS NOT NULL AND food_quantity_increment IS NOT NULL AND food_minimum_quantity IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS products_food_selling_unit_idx
  ON public.products(food_selling_unit) WHERE food_selling_unit IS NOT NULL;

CREATE OR REPLACE FUNCTION public.vendor_set_food_product_details(
  p_product_id uuid,
  p_selling_unit text,
  p_unit_price numeric,
  p_quantity_increment integer,
  p_minimum_quantity integer
)
RETURNS public.products
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_category_id uuid;
  v_is_food boolean:=false;
  v_divisor numeric;
  v_price_per_increment numeric(12,2);
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Sign in required.';
  END IF;
  IF p_selling_unit NOT IN ('kg','g','l','ml','piece','dozen','pack')
     OR p_unit_price IS NULL OR p_unit_price<0
     OR p_quantity_increment IS NULL OR p_quantity_increment<1
     OR p_minimum_quantity IS NULL OR p_minimum_quantity<1 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Enter valid food selling unit, price, increment and minimum quantity.';
  END IF;
  SELECT p.* INTO v_product FROM public.products p
  JOIN public.seller_profiles s ON s.id=p.seller_id
  WHERE p.id=p_product_id AND s.user_id=(SELECT auth.uid()) AND s.status='approved'
  FOR UPDATE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='This product is not available to your vendor account.'; END IF;
  v_category_id:=v_product.category_id;
  WHILE v_category_id IS NOT NULL LOOP
    SELECT (c.slug='food-groceries'),c.parent_id INTO v_is_food,v_category_id
    FROM public.categories c WHERE c.id=v_category_id;
    EXIT WHEN v_is_food OR v_category_id IS NULL;
  END LOOP;
  IF NOT v_is_food THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Food selling units are only available for Food & Groceries products.';
  END IF;
  v_divisor:=CASE WHEN p_selling_unit IN ('kg','l') THEN 1000 ELSE 1 END;
  IF p_selling_unit IN ('kg','l') AND (p_quantity_increment>1000 OR 1000 % p_quantity_increment<>0) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='For kg or litre, choose a step that divides 1000 (for example 50, 100, 250 or 500).';
  END IF;
  v_price_per_increment:=round(p_unit_price*p_quantity_increment/v_divisor,2);
  UPDATE public.products SET food_selling_unit=p_selling_unit,food_unit_price=p_unit_price,
    food_quantity_increment=p_quantity_increment,food_minimum_quantity=p_minimum_quantity,
    price=v_price_per_increment,updated_at=now()
  WHERE id=p_product_id RETURNING * INTO v_product;
  RETURN v_product;
END;
$$;
REVOKE ALL ON FUNCTION public.vendor_set_food_product_details(uuid,text,numeric,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vendor_set_food_product_details(uuid,text,numeric,integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_food_product_category()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $$
DECLARE v_category_id uuid; v_is_food boolean:=false;
BEGIN
  IF NEW.food_selling_unit IS NULL THEN RETURN NEW; END IF;
  v_category_id:=NEW.category_id;
  WHILE v_category_id IS NOT NULL LOOP
    SELECT (c.slug='food-groceries'),c.parent_id INTO v_is_food,v_category_id
    FROM public.categories c WHERE c.id=v_category_id;
    EXIT WHEN v_is_food OR v_category_id IS NULL;
  END LOOP;
  IF NOT v_is_food THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Food selling units can only be configured for Food & Groceries products.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS products_enforce_food_category ON public.products;
CREATE TRIGGER products_enforce_food_category
BEFORE INSERT OR UPDATE OF category_id,food_selling_unit,food_unit_price,food_quantity_increment,food_minimum_quantity
ON public.products FOR EACH ROW EXECUTE FUNCTION public.enforce_food_product_category();

CREATE OR REPLACE FUNCTION public.enforce_food_product_order_quantity()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $$
DECLARE v_product public.products%ROWTYPE; v_amount integer; v_label text;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id=NEW.product_id;
  IF v_product.food_selling_unit IS NULL THEN RETURN NEW; END IF;
  IF NEW.quantity<COALESCE(v_product.food_minimum_quantity,1) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='The minimum purchase quantity for this food product has not been met.';
  END IF;
  v_amount:=NEW.quantity*COALESCE(v_product.food_quantity_increment,1);
  v_label:=CASE
    WHEN v_product.food_selling_unit='kg' AND v_amount%1000=0 THEN (v_amount/1000)::text||' kg'
    WHEN v_product.food_selling_unit IN ('kg','g') THEN v_amount::text||' g'
    WHEN v_product.food_selling_unit='l' AND v_amount%1000=0 THEN (v_amount/1000)::text||' L'
    WHEN v_product.food_selling_unit IN ('l','ml') THEN v_amount::text||' ml'
    WHEN v_product.food_selling_unit='piece' THEN v_amount::text||CASE WHEN v_amount=1 THEN ' piece' ELSE ' pieces' END
    WHEN v_product.food_selling_unit='dozen' THEN v_amount::text||' dozen'
    ELSE v_amount::text||CASE WHEN v_amount=1 THEN ' pack' ELSE ' packs' END
  END;
  NEW.product_snapshot:=COALESCE(NEW.product_snapshot,'{}'::jsonb)||jsonb_build_object(
    'food_selling_unit',v_product.food_selling_unit,
    'food_unit_price',v_product.food_unit_price,
    'food_quantity_increment',v_product.food_quantity_increment,
    'food_minimum_quantity',v_product.food_minimum_quantity,
    'display_quantity',v_label
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS order_items_food_quantity_snapshot ON public.order_items;
CREATE TRIGGER order_items_food_quantity_snapshot
BEFORE INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.enforce_food_product_order_quantity();

CREATE OR REPLACE FUNCTION public.vendor_set_daily_availability(
 p_product_id uuid,p_is_daily_item boolean,p_available_quantity integer,
 p_minimum_quantity integer DEFAULT 1,p_minimum_order_value numeric DEFAULT NULL,p_shop_is_open boolean DEFAULT NULL
)
RETURNS public.products LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_product public.products; v_seller_id uuid; v_category_id uuid; v_is_food boolean:=false;
BEGIN
 IF p_available_quantity<0 OR p_minimum_quantity<1 OR p_minimum_order_value<0 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Daily quantity, minimum quantity or minimum order value is invalid.';
 END IF;
 SELECT s.id INTO v_seller_id FROM public.seller_profiles s
 WHERE s.user_id=(SELECT auth.uid()) AND s.status='approved' FOR UPDATE;
 IF v_seller_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Approved vendor account required.'; END IF;
 SELECT p.* INTO v_product FROM public.products p
 WHERE p.id=p_product_id AND p.seller_id=v_seller_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Product access denied.'; END IF;
 IF p_is_daily_item THEN
  v_category_id:=v_product.category_id;
  WHILE v_category_id IS NOT NULL LOOP
   SELECT (c.slug='food-groceries'),c.parent_id INTO v_is_food,v_category_id FROM public.categories c WHERE c.id=v_category_id;
   EXIT WHEN v_is_food OR v_category_id IS NULL;
  END LOOP;
  IF NOT v_is_food THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Daily stock is only available for Food & Groceries products.'; END IF;
 END IF;
 UPDATE public.products p SET is_daily_item=p_is_daily_item,
  daily_available_quantity=CASE WHEN p_is_daily_item THEN p_available_quantity ELSE 0 END,
  daily_minimum_quantity=p_minimum_quantity,
  daily_available_on=CASE WHEN p_is_daily_item THEN (now() AT TIME ZONE 'Asia/Karachi')::date ELSE NULL END,
  updated_at=now()
 WHERE p.id=p_product_id RETURNING p.* INTO v_product;
 IF p_is_daily_item THEN
  UPDATE public.product_inventory SET quantity=p_available_quantity,updated_at=now()
  WHERE product_id=p_product_id AND variant_id IS NULL;
  IF NOT FOUND THEN INSERT INTO public.product_inventory(product_id,variant_id,quantity) VALUES(p_product_id,NULL,p_available_quantity); END IF;
 END IF;
 IF p_minimum_order_value IS NOT NULL OR p_shop_is_open IS NOT NULL THEN
  UPDATE public.seller_profiles SET minimum_order_value=COALESCE(p_minimum_order_value,minimum_order_value),
   shop_is_open=COALESCE(p_shop_is_open,shop_is_open),updated_at=now() WHERE id=v_seller_id;
 END IF;
 RETURN v_product;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_availability(product_ids uuid[])
RETURNS TABLE(product_id uuid,variant_id uuid,is_available boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
BEGIN
 IF COALESCE(pg_catalog.cardinality(product_ids),0)>100 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='At most 100 product IDs may be requested.';
 END IF;
 RETURN QUERY
 SELECT p.id,v.id,
  CASE
   WHEN p.is_daily_item THEN p.daily_available_on=(now() AT TIME ZONE 'Asia/Karachi')::date AND p.daily_available_quantity>0
   WHEN NOT p.track_inventory THEN true
   ELSE COALESCE(i.quantity>0,false)
  END
 FROM public.products p
 LEFT JOIN public.product_variants v ON v.product_id=p.id AND v.is_active
 LEFT JOIN public.product_inventory i ON i.product_id=p.id AND i.variant_id IS NOT DISTINCT FROM v.id
 WHERE p.publication_status='published'::public.publication_status
  AND p.moderation_status='approved'
  AND p.stock_verification_status<>'paused'
  AND p.id=ANY(COALESCE(product_ids,ARRAY[]::uuid[]))
  AND (v.id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.product_variants av WHERE av.product_id=p.id AND av.is_active));
END;
$$;

-- Configure sample Parchon food listings with human-readable selling units.
UPDATE public.products p
SET food_selling_unit=v.unit,food_unit_price=v.unit_price,
    food_quantity_increment=v.increment,food_minimum_quantity=1,
    price=round(v.unit_price*v.increment/CASE WHEN v.unit IN ('kg','l') THEN 1000 ELSE 1 END,2),
    updated_at=now()
FROM (VALUES
 ('parchon-fresh-bananas','kg',220::numeric,250),
 ('parchon-red-tomatoes','kg',180::numeric,250),
 ('parchon-fresh-potatoes','kg',140::numeric,250),
 ('parchon-farm-fresh-eggs','dozen',360::numeric,1),
 ('parchon-fresh-milk','l',280::numeric,250),
 ('parchon-basmati-rice','kg',420::numeric,250)
) AS v(slug,unit,unit_price,increment)
WHERE p.slug=v.slug AND p.category_id=(SELECT id FROM public.categories WHERE slug='food-groceries');
