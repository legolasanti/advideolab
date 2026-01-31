/*
  Warnings:

  - You are about to drop the column `planTier` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `plan` on the `Tenant` table. All the data in the column will be lost.
  - You are about to drop the `PlanTier` enum. If the enum is used in other tables, you will encounter errors.
*/

-- DropForeignKey & indexes handled automatically by Prisma for removed columns.

ALTER TABLE "Tenant" DROP COLUMN "plan";
ALTER TABLE "Plan" DROP COLUMN "planTier";

DROP TYPE "PlanTier";
