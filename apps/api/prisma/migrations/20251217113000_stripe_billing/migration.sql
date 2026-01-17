-- Stripe billing + B2B billing fields
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingEntityType') THEN
    CREATE TYPE "BillingEntityType" AS ENUM ('individual', 'company');
  END IF;
END
$$;

ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "billingEntityType" "BillingEntityType" NOT NULL DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS "billingCompanyName" TEXT,
  ADD COLUMN IF NOT EXISTS "billingCountry" VARCHAR(2),
  ADD COLUMN IF NOT EXISTS "billingVatNumber" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "appliedCouponCode" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "stripeCustomerId" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "stripeCheckoutSessionId" VARCHAR(128);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Tenant_stripeCustomerId_key') THEN
    CREATE UNIQUE INDEX "Tenant_stripeCustomerId_key" ON "Tenant"("stripeCustomerId");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Tenant_stripeSubscriptionId_key') THEN
    CREATE UNIQUE INDEX "Tenant_stripeSubscriptionId_key" ON "Tenant"("stripeSubscriptionId");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Tenant_stripeCheckoutSessionId_key') THEN
    CREATE UNIQUE INDEX "Tenant_stripeCheckoutSessionId_key" ON "Tenant"("stripeCheckoutSessionId");
  END IF;
END
$$;

ALTER TABLE "Coupon"
  ADD COLUMN IF NOT EXISTS "stripeCouponId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Coupon_stripeCouponId_key') THEN
    CREATE UNIQUE INDEX "Coupon_stripeCouponId_key" ON "Coupon"("stripeCouponId");
  END IF;
END
$$;

COMMIT;

