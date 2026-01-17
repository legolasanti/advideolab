-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('pending', 'active', 'suspended');

-- AlterTable
ALTER TABLE "Tenant"
  ADD COLUMN     "billingNotes" TEXT,
  ADD COLUMN     "nextBillingDate" TIMESTAMP(3),
  ADD COLUMN     "requestedPlanCode" TEXT,
  ADD COLUMN     "status" "TenantStatus" NOT NULL DEFAULT 'pending';

UPDATE "Tenant"
SET "status" = CASE
  WHEN "isSuspended" THEN 'suspended'::"TenantStatus"
  ELSE 'active'::"TenantStatus"
END;

ALTER TABLE "Tenant"
  ALTER COLUMN "subdomain" DROP NOT NULL,
  ALTER COLUMN "n8nBaseUrl" DROP NOT NULL,
  ALTER COLUMN "n8nProcessPath" DROP NOT NULL;

ALTER TABLE "Tenant"
  DROP COLUMN "isSuspended";
