-- CreateEnum
CREATE TYPE "CrmStore" AS ENUM ('PHARMACY_DIRECT', 'CHEMPRO', 'CHEMIST_OUTLET', 'CHEMIST_AUSTRALIA', 'OTHER');

-- AlterTable
ALTER TABLE "crm_interactions" ADD COLUMN     "orderNumber" TEXT,
ADD COLUMN     "store" "CrmStore" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "storeOther" TEXT;

-- CreateIndex
CREATE INDEX "crm_interactions_store_idx" ON "crm_interactions"("store");

-- CreateIndex
CREATE INDEX "crm_interactions_orderNumber_idx" ON "crm_interactions"("orderNumber");
