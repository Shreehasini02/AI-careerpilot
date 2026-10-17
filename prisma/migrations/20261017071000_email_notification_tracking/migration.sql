CREATE TABLE "EmailNotification" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "template" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "providerId" TEXT,
  "lastError" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailNotification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmailNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EmailNotification_userId_template_key" ON "EmailNotification"("userId", "template");
CREATE INDEX "EmailNotification_status_updatedAt_idx" ON "EmailNotification"("status", "updatedAt");
