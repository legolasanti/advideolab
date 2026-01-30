-- Add missing n8n and API keys columns to SystemConfig

ALTER TABLE "SystemConfig"
  ADD COLUMN IF NOT EXISTS "n8nBaseUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "n8nProcessPath" TEXT,
  ADD COLUMN IF NOT EXISTS "n8nInternalToken" TEXT,
  ADD COLUMN IF NOT EXISTS "apiKeysEncrypted" TEXT;
