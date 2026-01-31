-- Create new enum for job kinds
CREATE TYPE "JobKind" AS ENUM ('video', 'image', 'other');

-- Create Plan table to manage SaaS pricing
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "planTier" "PlanTier" NOT NULL,
    "monthlyPriceUsd" INTEGER NOT NULL,
    "monthlyVideoLimit" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");
CREATE UNIQUE INDEX "Plan_planTier_key" ON "Plan"("planTier");

-- Extend Tenant with plan references and usage tracking
ALTER TABLE "Tenant"
    ADD COLUMN "planId" TEXT,
    ADD COLUMN "monthlyVideoLimit" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "videosUsedThisCycle" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "billingCycleStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Tenant_planId_idx" ON "Tenant"("planId");

ALTER TABLE "Tenant"
    ADD CONSTRAINT "Tenant_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the three default plans inside the migration so tenants can reference them immediately
INSERT INTO "Plan" ("id", "name", "code", "planTier", "monthlyPriceUsd", "monthlyVideoLimit") VALUES
    ('plan_starter', 'Starter', 'starter', 'P100', 69, 10),
    ('plan_growth', 'Growth', 'growth', 'P500', 179, 30),
    ('plan_scale', 'Scale', 'scale', 'P2000', 499, 100);

-- Align existing tenants with the new plan rows and copy monthly limits for stability
UPDATE "Tenant" t
SET
    "planId" = p."id",
    "monthlyVideoLimit" = p."monthlyVideoLimit"
FROM "Plan" p
WHERE p."planTier" = t."plan";

-- Track job kind for future quota checks
ALTER TABLE "Job"
    ADD COLUMN "kind" "JobKind" NOT NULL DEFAULT 'video';
