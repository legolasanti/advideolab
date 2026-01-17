-- System-wide settings (SMTP, Stripe, owner sandbox)
BEGIN;

CREATE TABLE IF NOT EXISTS "SystemConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUser" TEXT,
    "smtpPassEncrypted" TEXT,
    "emailFrom" TEXT,
    "notificationEmail" TEXT,
    "stripePublishableKey" TEXT,
    "stripeSecretKeyEncrypted" TEXT,
    "stripeWebhookSecretEncrypted" TEXT,
    "stripePriceIdStarter" TEXT,
    "stripePriceIdGrowth" TEXT,
    "stripePriceIdScale" TEXT,
    "sandboxTenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

COMMIT;

