-- Extend interview sessions with user-selected role/difficulty and a persisted summary.
ALTER TYPE "InterviewStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "Interview"
  ADD COLUMN "targetRole" TEXT,
  ADD COLUMN "requestedDifficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN "summary" TEXT,
  ADD COLUMN "recommendedTopics" JSONB;

ALTER TABLE "InterviewAnswer"
  ADD COLUMN "strengths" JSONB,
  ADD COLUMN "improvements" JSONB,
  ADD COLUMN "exampleAnswer" TEXT;
