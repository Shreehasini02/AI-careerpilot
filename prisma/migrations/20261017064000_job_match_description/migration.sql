-- Keep the source job description alongside its analysis for user-owned history.
-- Nullable so existing records remain valid and are not rewritten or discarded.
ALTER TABLE "JobMatchAnalysis"
  ADD COLUMN "jobDescription" TEXT;
