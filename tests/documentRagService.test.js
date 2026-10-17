import test from "node:test";
import assert from "node:assert/strict";
import { chunkDocumentText } from "../services/documentRagService.js";

test("chunkDocumentText normalizes whitespace and keeps every chunk within its bound", () => {
  const source = Array.from({ length: 1200 }, (_, index) => `Career skill ${index} with practical project experience.`).join("\n\n");
  const chunks = chunkDocumentText(source);

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 1800));
  assert.ok(chunks.every((chunk) => chunk.trim() === chunk));
});

test("chunkDocumentText creates overlapping neighboring chunks for continuity", () => {
  const source = Array.from({ length: 180 }, (_, index) => `Section ${index}: designed and maintained a backend service with reliable data validation.`).join(" ");
  const chunks = chunkDocumentText(source);

  assert.ok(chunks.length > 1);
  for (let index = 1; index < chunks.length; index += 1) {
    assert.ok(chunks[index - 1].includes(chunks[index].slice(0, 120)));
  }
});

test("chunkDocumentText rejects documents that exceed the chunk limit", () => {
  assert.throws(() => chunkDocumentText("career ".repeat(27000)), /no more than 100 searchable sections/);
});

test("chunkDocumentText returns no chunks for empty input", () => {
  assert.deepEqual(chunkDocumentText(" \n \t "), []);
});
