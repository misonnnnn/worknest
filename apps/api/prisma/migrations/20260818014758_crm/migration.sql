-- CreateEnum
CREATE TYPE "CrmChannel" AS ENUM ('PHONE', 'EMAIL', 'CHAT', 'WALK_IN', 'OTHER');

-- CreateEnum
CREATE TYPE "CrmInteractionType" AS ENUM ('INBOUND_CALL', 'OUTBOUND_CALL', 'EMAIL', 'CHAT', 'OTHER');

-- CreateEnum
CREATE TYPE "CrmResolution" AS ENUM ('RESOLVED_FIRST_CONTACT', 'RESOLVED', 'CALLBACK_REQUIRED', 'PENDING', 'ESCALATED', 'NO_RESOLUTION', 'OTHER');

-- CreateEnum
CREATE TYPE "CrmInteractionStatus" AS ENUM ('COMPLETED', 'PENDING', 'IN_PROGRESS', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CrmPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CrmCaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CrmFollowUpStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CrmFollowUpType" AS ENUM ('CALL', 'EMAIL', 'VISIT', 'OTHER');

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "storeName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "legacySource" TEXT,
    "legacyRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_cases" (
    "id" UUID NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "priority" "CrmPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "CrmCaseStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" UUID,
    "closedAt" TIMESTAMP(3),
    "legacySource" TEXT,
    "legacyRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_interactions" (
    "id" UUID NOT NULL,
    "interactionNumber" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "caseId" UUID,
    "agentId" UUID NOT NULL,
    "channel" "CrmChannel" NOT NULL,
    "interactionType" "CrmInteractionType" NOT NULL,
    "interactionDate" TIMESTAMP(3) NOT NULL,
    "durationSeconds" INTEGER,
    "inquiry" TEXT,
    "notes" TEXT,
    "resolution" "CrmResolution",
    "status" "CrmInteractionStatus" NOT NULL DEFAULT 'COMPLETED',
    "priority" "CrmPriority" NOT NULL DEFAULT 'NORMAL',
    "legacySource" TEXT,
    "legacyRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_follow_ups" (
    "id" UUID NOT NULL,
    "interactionId" UUID,
    "caseId" UUID,
    "customerId" UUID NOT NULL,
    "assignedToId" UUID NOT NULL,
    "followUpDate" TIMESTAMP(3) NOT NULL,
    "followUpType" "CrmFollowUpType" NOT NULL DEFAULT 'CALL',
    "notes" TEXT,
    "status" "CrmFollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_log_comments" (
    "id" UUID NOT NULL,
    "interactionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_log_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_code_key" ON "customers"("code");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE INDEX "customers_storeName_idx" ON "customers"("storeName");

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- CreateIndex
CREATE INDEX "customers_email_idx" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_isActive_idx" ON "customers"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "customers_legacySource_legacyRecordId_key" ON "customers"("legacySource", "legacyRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_cases_caseNumber_key" ON "crm_cases"("caseNumber");

-- CreateIndex
CREATE INDEX "crm_cases_customerId_idx" ON "crm_cases"("customerId");

-- CreateIndex
CREATE INDEX "crm_cases_assignedToId_idx" ON "crm_cases"("assignedToId");

-- CreateIndex
CREATE INDEX "crm_cases_status_idx" ON "crm_cases"("status");

-- CreateIndex
CREATE INDEX "crm_cases_priority_idx" ON "crm_cases"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "crm_cases_legacySource_legacyRecordId_key" ON "crm_cases"("legacySource", "legacyRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_interactions_interactionNumber_key" ON "crm_interactions"("interactionNumber");

-- CreateIndex
CREATE INDEX "crm_interactions_customerId_idx" ON "crm_interactions"("customerId");

-- CreateIndex
CREATE INDEX "crm_interactions_caseId_idx" ON "crm_interactions"("caseId");

-- CreateIndex
CREATE INDEX "crm_interactions_agentId_idx" ON "crm_interactions"("agentId");

-- CreateIndex
CREATE INDEX "crm_interactions_interactionDate_idx" ON "crm_interactions"("interactionDate");

-- CreateIndex
CREATE INDEX "crm_interactions_status_idx" ON "crm_interactions"("status");

-- CreateIndex
CREATE INDEX "crm_interactions_priority_idx" ON "crm_interactions"("priority");

-- CreateIndex
CREATE INDEX "crm_interactions_channel_idx" ON "crm_interactions"("channel");

-- CreateIndex
CREATE UNIQUE INDEX "crm_interactions_legacySource_legacyRecordId_key" ON "crm_interactions"("legacySource", "legacyRecordId");

-- CreateIndex
CREATE INDEX "crm_follow_ups_customerId_idx" ON "crm_follow_ups"("customerId");

-- CreateIndex
CREATE INDEX "crm_follow_ups_interactionId_idx" ON "crm_follow_ups"("interactionId");

-- CreateIndex
CREATE INDEX "crm_follow_ups_caseId_idx" ON "crm_follow_ups"("caseId");

-- CreateIndex
CREATE INDEX "crm_follow_ups_assignedToId_idx" ON "crm_follow_ups"("assignedToId");

-- CreateIndex
CREATE INDEX "crm_follow_ups_followUpDate_idx" ON "crm_follow_ups"("followUpDate");

-- CreateIndex
CREATE INDEX "crm_follow_ups_status_idx" ON "crm_follow_ups"("status");

-- CreateIndex
CREATE INDEX "crm_log_comments_interactionId_idx" ON "crm_log_comments"("interactionId");

-- CreateIndex
CREATE INDEX "crm_log_comments_userId_idx" ON "crm_log_comments"("userId");

-- AddForeignKey
ALTER TABLE "crm_cases" ADD CONSTRAINT "crm_cases_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_cases" ADD CONSTRAINT "crm_cases_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_interactions" ADD CONSTRAINT "crm_interactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_interactions" ADD CONSTRAINT "crm_interactions_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "crm_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_interactions" ADD CONSTRAINT "crm_interactions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_follow_ups" ADD CONSTRAINT "crm_follow_ups_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "crm_interactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_follow_ups" ADD CONSTRAINT "crm_follow_ups_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "crm_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_follow_ups" ADD CONSTRAINT "crm_follow_ups_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_follow_ups" ADD CONSTRAINT "crm_follow_ups_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_log_comments" ADD CONSTRAINT "crm_log_comments_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "crm_interactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_log_comments" ADD CONSTRAINT "crm_log_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
