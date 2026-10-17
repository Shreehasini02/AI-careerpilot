import { createHash, randomUUID } from "node:crypto";
import { prisma } from "../config/prisma.js";
import { generateEmbedding } from "./geminiService.js";

const EMBEDDING_DIMENSIONS = 768;
const CHUNK_SIZE = 1800;
const CHUNK_OVERLAP = 240;
const MAX_CHUNKS_PER_DOCUMENT = 100;
const MAX_RETRIEVAL_RESULTS = 5;
const MAX_CONTEXT_CHARACTERS = 6000;
const MAX_COSINE_DISTANCE = 0.65;

export function getEmbeddingModel() {
  const model = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-2";
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(model)) {
    const error = new Error("GEMINI_EMBEDDING_MODEL is configured incorrectly.");
    error.status = 503;
    error.expose = true;
    throw error;
  }
  return model;
}

export function chunkDocumentText(text) {
  const normalized = String(text || "").replace(/\r\n?/g, "\n").replace(/[\t\f\v ]+/g, " ").trim();
  if (!normalized) return [];

  const chunks = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + CHUNK_SIZE, normalized.length);
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf(" ", end);
      if (boundary > start + Math.floor(CHUNK_SIZE * 0.65)) end = boundary;
    }
    const content = normalized.slice(start, end).trim();
    if (content) chunks.push(content);
    if (chunks.length > MAX_CHUNKS_PER_DOCUMENT) {
      const error = new Error(`A document may contain no more than ${MAX_CHUNKS_PER_DOCUMENT} searchable sections.`);
      error.status = 413;
      error.expose = true;
      throw error;
    }
    if (end >= normalized.length) break;
    start = Math.max(start + 1, end - CHUNK_OVERLAP);
  }
  return chunks;
}

async function embedChunks(chunks, title) {
  const vectors = [];
  for (let index = 0; index < chunks.length; index += 3) {
    const group = chunks.slice(index, index + 3);
    const embeddings = await Promise.all(group.map((content) => generateEmbedding(content, "document", title)));
    vectors.push(...embeddings);
  }
  return vectors;
}

export async function ingestDocumentChunks({ documentId, userId, text, title }) {
  const model = getEmbeddingModel();
  const chunks = chunkDocumentText(text);
  if (!chunks.length) {
    const error = new Error("There is no extracted text to index. Analyze this PDF first.");
    error.status = 422;
    error.expose = true;
    throw error;
  }

  const document = await prisma.document.findFirst({
    where: { id: documentId, userId },
    select: { id: true, ingestionStatus: true, ingestionModel: true, updatedAt: true }
  });
  if (!document) {
    const error = new Error("Document not found.");
    error.status = 404;
    error.expose = true;
    throw error;
  }

  if (document.ingestionStatus === "READY" && document.ingestionModel === model) {
    const count = await prisma.documentChunk.count({ where: { documentId, userId, embeddingModel: model } });
    if (count === chunks.length) return { status: "READY", chunkCount: count, model, alreadyIndexed: true };
  }

  const staleProcessingCutoff = new Date(Date.now() - 15 * 60 * 1000);
  const claimed = await prisma.document.updateMany({
    where: {
      id: documentId,
      userId,
      OR: [{ ingestionStatus: { not: "PROCESSING" } }, { updatedAt: { lt: staleProcessingCutoff } }]
    },
    data: { ingestionStatus: "PROCESSING", updatedAt: new Date() }
  });
  if (!claimed.count) {
    const error = new Error("This document is already being indexed. Please wait and refresh the document list.");
    error.status = 409;
    error.expose = true;
    error.code = "INDEXING_IN_PROGRESS";
    throw error;
  }

  try {
    const embeddings = await embedChunks(chunks, title);
    if (embeddings.length !== chunks.length || embeddings.some((vector) => vector.length !== EMBEDDING_DIMENSIONS)) {
      throw new Error("Embedding dimensions did not match the configured vector store.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM "DocumentChunk" WHERE "documentId" = ${documentId}::uuid AND "userId" = ${userId}::uuid`;
      for (let index = 0; index < chunks.length; index += 1) {
        const vectorLiteral = `[${embeddings[index].join(",")}]`;
        const contentHash = createHash("sha256").update(chunks[index], "utf8").digest("hex");
        await tx.$executeRaw`
          INSERT INTO "DocumentChunk" ("id", "documentId", "userId", "chunkIndex", "content", "embedding", "embeddingModel", "contentHash")
          VALUES (${randomUUID()}::uuid, ${documentId}::uuid, ${userId}::uuid, ${index}, ${chunks[index]}, ${vectorLiteral}::vector(768), ${model}, ${contentHash})
        `;
      }
      await tx.document.update({
        where: { id: documentId },
        data: { ingestionStatus: "READY", ingestionModel: model, ingestedAt: new Date(), updatedAt: new Date() }
      });
    });

    return { status: "READY", chunkCount: chunks.length, model, alreadyIndexed: false };
  } catch (cause) {
    await prisma.document.updateMany({
      where: { id: documentId, userId, ingestionStatus: "PROCESSING" },
      data: { ingestionStatus: "FAILED", updatedAt: new Date() }
    }).catch(() => {});
    if (cause.expose) throw cause;
    console.warn("Document indexing failed", { errorType: cause.name || "UnknownError" });
    const error = new Error("This document could not be indexed for AI search. Please try again.");
    error.status = 502;
    error.expose = true;
    throw error;
  }
}

export async function retrieveRelevantChunks({ userId, query, limit = MAX_RETRIEVAL_RESULTS }) {
  const safeLimit = Math.max(1, Math.min(MAX_RETRIEVAL_RESULTS, Math.floor(limit) || MAX_RETRIEVAL_RESULTS));
  const model = getEmbeddingModel();

  try {
    const readyCount = await prisma.document.count({ where: { userId, ingestionStatus: "READY", ingestionModel: model } });
    if (!readyCount) return [];
    const embedding = await generateEmbedding(String(query).slice(0, 1800), "query");
    if (embedding.length !== EMBEDDING_DIMENSIONS) throw new Error("Unexpected query vector dimensions.");
    const vectorLiteral = `[${embedding.join(",")}]`;
    const results = await prisma.$queryRaw`
      WITH owned_chunks AS MATERIALIZED (
        SELECT dc."documentId", d."title", dc."chunkIndex", dc."content", dc."embedding"
        FROM "DocumentChunk" AS dc
        INNER JOIN "Document" AS d ON d."id" = dc."documentId" AND d."userId" = dc."userId"
        WHERE dc."userId" = ${userId}::uuid
          AND d."userId" = ${userId}::uuid
          AND d."ingestionStatus" = 'READY'
          AND d."ingestionModel" = ${model}
          AND dc."embeddingModel" = ${model}
      )
      SELECT "documentId", "title", "chunkIndex", "content",
             1 - ("embedding" <=> ${vectorLiteral}::vector(768)) AS "similarity"
      FROM owned_chunks
      WHERE "embedding" <=> ${vectorLiteral}::vector(768) <= ${MAX_COSINE_DISTANCE}
      ORDER BY "embedding" <=> ${vectorLiteral}::vector(768)
      LIMIT ${safeLimit}
    `;

    let remaining = MAX_CONTEXT_CHARACTERS;
    return results.flatMap((row) => {
      if (remaining <= 0 || typeof row.content !== "string") return [];
      const content = row.content.slice(0, remaining);
      remaining -= content.length;
      return [{
        documentId: row.documentId,
        title: row.title,
        chunkIndex: row.chunkIndex,
        content,
        similarity: Number(row.similarity)
      }];
    });
  } catch (cause) {
    if (cause.expose) throw cause;
    console.warn("Document retrieval failed", { errorType: cause.name || "UnknownError" });
    const error = new Error("Document search is temporarily unavailable. Try again shortly.");
    error.status = 503;
    error.expose = true;
    throw error;
  }
}

export const RAG_LIMITS = Object.freeze({
  embeddingDimensions: EMBEDDING_DIMENSIONS,
  chunkSize: CHUNK_SIZE,
  chunkOverlap: CHUNK_OVERLAP,
  maxChunksPerDocument: MAX_CHUNKS_PER_DOCUMENT,
  maxRetrievedChunks: MAX_RETRIEVAL_RESULTS,
  maxContextCharacters: MAX_CONTEXT_CHARACTERS
});
