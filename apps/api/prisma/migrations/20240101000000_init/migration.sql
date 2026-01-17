-- Prisma migration scaffold corresponding to schema.prisma
CREATE TYPE "PlanTier" AS ENUM ('P100', 'P500', 'P2000');
CREATE TYPE "UserRole" AS ENUM ('tenant_admin', 'user');
CREATE TYPE "JobStatus" AS ENUM ('pending', 'running', 'done', 'error');
CREATE TYPE "AssetType" AS ENUM ('input', 'output');

CREATE TABLE "Tenant" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "subdomain" TEXT NOT NULL UNIQUE,
  "plan" "PlanTier" NOT NULL DEFAULT 'P100',
  "resetDay" INTEGER NOT NULL DEFAULT 1,
  "n8nBaseUrl" TEXT NOT NULL,
  "n8nProcessPath" TEXT NOT NULL,
  "logoUrl" TEXT,
  "defaultWatermarkText" TEXT,
  "defaultLogoPos" VARCHAR(32),
  "defaultLogoScale" INTEGER DEFAULT 100,
  "isSuspended" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX "Tenant_plan_idx" ON "Tenant" ("plan");

CREATE TABLE "Owner" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "tenantId" TEXT REFERENCES "Tenant"("id")
);

CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id"),
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'user',
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "ApiKey" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id"),
  "provider" TEXT NOT NULL,
  "keyEncrypted" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "ApiKey_tenant_provider_idx" ON "ApiKey" ("tenantId", "provider");

CREATE TABLE "Usage" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id"),
  "monthKey" VARCHAR(6) NOT NULL,
  "used" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "Usage_tenant_month_idx" ON "Usage" ("tenantId", "monthKey");

CREATE TABLE "Job" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id"),
  "status" "JobStatus" NOT NULL DEFAULT 'pending',
  "options" JSONB NOT NULL,
  "inputAssetId" TEXT,
  "outputs" JSONB,
  "error" TEXT,
  "cost" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "finishedAt" TIMESTAMP
);

CREATE TABLE "Asset" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id"),
  "jobId" TEXT,
  "type" "AssetType" NOT NULL,
  "url" TEXT NOT NULL,
  "meta" JSONB,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "Audit" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id"),
  "actorUserId" TEXT REFERENCES "User"("id"),
  "action" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE "Asset"
  ADD CONSTRAINT "Asset_job_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id");
