-- CreateTable
CREATE TABLE "CmsContent" (
    "id" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CmsContent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CmsContent_section_key_key" ON "CmsContent"("section", "key");
