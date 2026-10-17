CREATE TABLE "ResumeAnalysisRecord" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "sourceTitle" TEXT,
  "targetRole" TEXT,
  "analysis" JSONB NOT NULL,
  "extraction" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResumeAnalysisRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ResumeAnalysisRecord_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ResumeAnalysisRecord_userId_createdAt_idx"
  ON "ResumeAnalysisRecord"("userId", "createdAt");

CREATE TABLE "JobMatchAnalysis" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "targetRole" TEXT,
  "analysis" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobMatchAnalysis_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JobMatchAnalysis_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "JobMatchAnalysis_userId_createdAt_idx"
  ON "JobMatchAnalysis"("userId", "createdAt");
