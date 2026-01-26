-- Add optional max uses limit for coupons.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'Coupon'
      AND column_name = 'maxUses'
  ) THEN
    ALTER TABLE "Coupon" ADD COLUMN "maxUses" INTEGER;
  END IF;
END
$$;
