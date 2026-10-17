-- Add planner controls and generation inputs without rewriting existing plans or tasks.
ALTER TABLE "StudyPlan"
  ADD COLUMN "targetRole" TEXT,
  ADD COLUMN "durationWeeks" INTEGER,
  ADD COLUMN "availableHoursPerWeek" INTEGER,
  ADD COLUMN "skillGaps" JSONB,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "requestKey" TEXT;

CREATE UNIQUE INDEX "StudyPlan_userId_requestKey_key"
  ON "StudyPlan"("userId", "requestKey");

ALTER TABLE "StudyTask"
  ADD COLUMN "week" INTEGER,
  ADD COLUMN "estimatedMinutes" INTEGER,
  ADD COLUMN "resourceUrl" TEXT;
