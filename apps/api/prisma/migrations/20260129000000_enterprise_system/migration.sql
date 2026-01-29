-- CreateEnum
CREATE TYPE "TenantType" AS ENUM ('standard', 'enterprise', 'sub_company');

-- CreateEnum
CREATE TYPE "EnterpriseInvitationStatus" AS ENUM ('pending', 'accepted', 'expired', 'cancelled');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "tenantType" "TenantType" NOT NULL DEFAULT 'standard';
ALTER TABLE "Tenant" ADD COLUMN "parentTenantId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "allocatedCredits" INTEGER DEFAULT 0;

-- CreateIndex
CREATE INDEX "Tenant_parentTenantId_idx" ON "Tenant"("parentTenantId");

-- CreateIndex
CREATE INDEX "Tenant_tenantType_idx" ON "Tenant"("tenantType");

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_parentTenantId_fkey" FOREIGN KEY ("parentTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "EnterpriseContactRequest" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "website" TEXT,
    "message" TEXT,
    "source" TEXT DEFAULT 'pricing_page',
    "readAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnterpriseContactRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnterpriseContactRequest_email_idx" ON "EnterpriseContactRequest"("email");

-- CreateIndex
CREATE INDEX "EnterpriseContactRequest_createdAt_idx" ON "EnterpriseContactRequest"("createdAt");

-- CreateTable
CREATE TABLE "EnterpriseInvitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "EnterpriseInvitationStatus" NOT NULL DEFAULT 'pending',
    "customMonthlyPriceUsd" INTEGER NOT NULL,
    "customAnnualPriceUsd" INTEGER,
    "billingInterval" "BillingInterval" NOT NULL DEFAULT 'monthly',
    "maxSubCompanies" INTEGER NOT NULL DEFAULT 5,
    "maxAdditionalUsers" INTEGER NOT NULL DEFAULT 10,
    "totalVideoCredits" INTEGER NOT NULL DEFAULT 100,
    "stripePriceId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdTenantId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnterpriseInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EnterpriseInvitation_tokenHash_key" ON "EnterpriseInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "EnterpriseInvitation_email_idx" ON "EnterpriseInvitation"("email");

-- CreateIndex
CREATE INDEX "EnterpriseInvitation_tokenHash_idx" ON "EnterpriseInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "EnterpriseInvitation_status_idx" ON "EnterpriseInvitation"("status");

-- CreateTable
CREATE TABLE "EnterpriseSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "maxSubCompanies" INTEGER NOT NULL DEFAULT 5,
    "maxAdditionalUsers" INTEGER NOT NULL DEFAULT 10,
    "totalVideoCredits" INTEGER NOT NULL DEFAULT 100,
    "allocatedCredits" INTEGER NOT NULL DEFAULT 0,
    "stripePriceId" TEXT,
    "customMonthlyPriceUsd" INTEGER,
    "customAnnualPriceUsd" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnterpriseSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EnterpriseSettings_tenantId_key" ON "EnterpriseSettings"("tenantId");

-- AddForeignKey
ALTER TABLE "EnterpriseSettings" ADD CONSTRAINT "EnterpriseSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
