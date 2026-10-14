-- Free-text customer on interactions / follow-ups (optional FK)

ALTER TABLE "crm_interactions" ADD COLUMN "customerName" TEXT;
ALTER TABLE "crm_interactions" ADD COLUMN "customerPhone" TEXT;

UPDATE "crm_interactions" i
SET
  "customerName" = c.name,
  "customerPhone" = c.phone
FROM "customers" c
WHERE i."customerId" = c.id;

UPDATE "crm_interactions" SET "customerName" = 'Unknown' WHERE "customerName" IS NULL;

ALTER TABLE "crm_interactions" ALTER COLUMN "customerName" SET NOT NULL;
ALTER TABLE "crm_interactions" ALTER COLUMN "customerId" DROP NOT NULL;

ALTER TABLE "crm_follow_ups" ADD COLUMN "customerName" TEXT;
ALTER TABLE "crm_follow_ups" ADD COLUMN "customerPhone" TEXT;

UPDATE "crm_follow_ups" f
SET
  "customerName" = c.name,
  "customerPhone" = c.phone
FROM "customers" c
WHERE f."customerId" = c.id;

ALTER TABLE "crm_follow_ups" ALTER COLUMN "customerId" DROP NOT NULL;

CREATE INDEX "crm_interactions_customerName_idx" ON "crm_interactions"("customerName");
CREATE INDEX "crm_interactions_customerPhone_idx" ON "crm_interactions"("customerPhone");
CREATE INDEX "crm_follow_ups_customerName_idx" ON "crm_follow_ups"("customerName");
