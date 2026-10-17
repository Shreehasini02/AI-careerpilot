CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "Document"
  ADD COLUMN "ingestionStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "ingestionModel" TEXT,
  ADD COLUMN "ingestedAt" TIMESTAMPTZ;

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_id_userId_key" UNIQUE ("id", "userId");

CREATE TABLE "DocumentChunk" (
  "id" UUID NOT NULL,
  "documentId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "embedding" vector(768) NOT NULL,
  "embeddingModel" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DocumentChunk_documentId_chunkIndex_key" UNIQUE ("documentId", "chunkIndex"),
  CONSTRAINT "DocumentChunk_documentId_userId_fkey"
    FOREIGN KEY ("documentId", "userId")
    REFERENCES "Document" ("id", "userId")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "DocumentChunk_userId_documentId_idx"
  ON "DocumentChunk" ("userId", "documentId");

CREATE INDEX "DocumentChunk_embedding_hnsw_idx"
  ON "DocumentChunk" USING hnsw ("embedding" vector_cosine_ops);
