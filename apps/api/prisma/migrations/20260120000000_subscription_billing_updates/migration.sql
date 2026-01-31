DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingInterval') THEN
    CREATE TYPE "BillingInterval" AS ENUM ('monthly', 'annual');
  END IF;
END
$$;

ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "billingInterval" "BillingInterval" NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS "subscriptionPeriodStart" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "subscriptionPeriodEnd" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "subscriptionCancelAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "subscriptionCanceledAt" TIMESTAMP(3);

ALTER TABLE "SystemConfig"
  ADD COLUMN IF NOT EXISTS "stripePriceIdStarterAnnual" TEXT,
  ADD COLUMN IF NOT EXISTS "stripePriceIdGrowthAnnual" TEXT,
  ADD COLUMN IF NOT EXISTS "stripePriceIdScaleAnnual" TEXT;

CREATE TABLE IF NOT EXISTS "SubscriptionCancellation" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT,
  "planCode" TEXT,
  "billingInterval" "BillingInterval" NOT NULL DEFAULT 'monthly',
  "reason" TEXT NOT NULL,
  "details" JSONB,
  "monthsActive" INTEGER,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "stripeSubscriptionId" VARCHAR(64),
  CONSTRAINT "SubscriptionCancellation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SubscriptionCancellation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SubscriptionCancellation_tenantId_idx" ON "SubscriptionCancellation"("tenantId");
CREATE INDEX IF NOT EXISTS "SubscriptionCancellation_requestedAt_idx" ON "SubscriptionCancellation"("requestedAt");
