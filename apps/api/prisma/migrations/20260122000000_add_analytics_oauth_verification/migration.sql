-- CreateEnum
CREATE TYPE "MarketingEventType" AS ENUM ('visit', 'signup_started', 'signup_completed', 'checkout_started', 'payment_completed');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "googleId" TEXT;
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN     "customHeadCode" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN     "customBodyStart" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN     "customBodyEnd" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN     "googleOAuthClientId" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN     "googleOAuthClientSecretEncrypted" TEXT;

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingEvent" (
    "id" TEXT NOT NULL,
    "eventType" "MarketingEventType" NOT NULL,
    "sessionId" VARCHAR(128) NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "utmSource" VARCHAR(128),
    "utmMedium" VARCHAR(128),
    "utmCampaign" VARCHAR(128),
    "referrer" TEXT,
    "landingPage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_token_key" ON "EmailVerificationToken"("token");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_email_idx" ON "EmailVerificationToken"("email");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- CreateIndex
CREATE INDEX "MarketingEvent_eventType_createdAt_idx" ON "MarketingEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "MarketingEvent_sessionId_idx" ON "MarketingEvent"("sessionId");

-- CreateIndex
CREATE INDEX "MarketingEvent_tenantId_idx" ON "MarketingEvent"("tenantId");

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEvent" ADD CONSTRAINT "MarketingEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEvent" ADD CONSTRAINT "MarketingEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
