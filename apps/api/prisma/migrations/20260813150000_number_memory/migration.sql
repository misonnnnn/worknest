-- CreateTable
CREATE TABLE "number_memory_results" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "maxDigits" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "number_memory_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "number_memory_results_userId_maxDigits_idx" ON "number_memory_results"("userId", "maxDigits");

-- CreateIndex
CREATE INDEX "number_memory_results_maxDigits_createdAt_idx" ON "number_memory_results"("maxDigits", "createdAt");

-- AddForeignKey
ALTER TABLE "number_memory_results" ADD CONSTRAINT "number_memory_results_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
