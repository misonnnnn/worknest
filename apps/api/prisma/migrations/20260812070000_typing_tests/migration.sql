-- CreateEnum
CREATE TYPE "TypingTestMode" AS ENUM ('TIME', 'WORDS');

-- CreateTable
CREATE TABLE "typing_test_results" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "wpm" DOUBLE PRECISION NOT NULL,
    "rawWpm" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "correctCharacters" INTEGER NOT NULL,
    "incorrectCharacters" INTEGER NOT NULL,
    "totalCharacters" INTEGER NOT NULL,
    "wordsCompleted" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "mode" "TypingTestMode" NOT NULL,
    "modeValue" INTEGER NOT NULL,
    "textCategory" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "typing_test_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "typing_test_results_userId_createdAt_idx" ON "typing_test_results"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "typing_test_results_createdAt_idx" ON "typing_test_results"("createdAt");

-- CreateIndex
CREATE INDEX "typing_test_results_mode_modeValue_wpm_idx" ON "typing_test_results"("mode", "modeValue", "wpm");

-- CreateIndex
CREATE INDEX "typing_test_results_wpm_accuracy_createdAt_idx" ON "typing_test_results"("wpm", "accuracy", "createdAt");

-- AddForeignKey
ALTER TABLE "typing_test_results" ADD CONSTRAINT "typing_test_results_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
