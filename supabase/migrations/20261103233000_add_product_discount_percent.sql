BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_discount_percent_range_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_discount_percent_range_check
      CHECK (discount_percent >= 0 AND discount_percent <= 100);
  END IF;
END
$$;

COMMENT ON COLUMN public.products.discount_percent IS
  'Admin-configured percentage discount applied to the product base and variant prices.';

COMMIT;
