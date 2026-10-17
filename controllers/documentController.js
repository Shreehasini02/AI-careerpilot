import { randomUUID } from "node:crypto";
import { basename, extname } from "node:path";
import { prisma } from "../config/prisma.js";
import { deleteDocumentExtraction, deleteStoredDocument, makeStorageKey, MAX_DOCUMENTS_PER_USER, readDocument, readDocumentExtraction, saveDocument, saveDocumentExtraction } from "../services/documentStorage.js";
import { isValidPdf } from "../middleware/pdfUpload.js";
import { extractResumeTextFromPdf, generateResumeAnalysis } from "../services/geminiService.js";
import { ingestDocumentChunks } from "../services/documentRagService.js";

const DOCUMENT_SELECT = { id: true, title: true, fileType: true, ingestionStatus: true, ingestionModel: true, ingestedAt: true, createdAt: true, updatedAt: true };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TARGET_ROLE_LENGTH = 120;
const MAX_RESUME_PAGES = 20;

function isUsableExtraction(extraction) {
  return extraction && typeof extraction.text === "string" &&
    extraction.text.length >= 80 && extraction.text.length <= 16000 &&
    ["digitally_generated", "scanned_image", "mixed"].includes(extraction.sourceType) &&
    extraction.truncated === false && Number.isInteger(extraction.pageCount) &&
    extraction.pageCount >= 1 && extraction.pageCount <= MAX_RESUME_PAGES;
}

async function getOrExtractDocumentText(document) {
  let extraction = await readDocumentExtraction(document.fileUrl);
  if (isUsableExtraction(extraction)) return extraction;

  const pdfBuffer = await readDocument(document.fileUrl);
  if (!isValidPdf(pdfBuffer)) {
    const error = new Error("The stored file is not a valid PDF.");
    error.status = 415;
    error.expose = true;
    throw error;
  }

  extraction = await extractResumeTextFromPdf(pdfBuffer);
  if (extraction.pageCount > MAX_RESUME_PAGES) {
    const error = new Error(`Resume PDFs must have ${MAX_RESUME_PAGES} pages or fewer.`);
    error.status = 413;
    error.expose = true;
    throw error;
  }
  if (extraction.truncated || extraction.text.length > 16000) {
    const error = new Error("This resume contains too much text to analyze. Use a shorter PDF with no more than 16,000 characters.");
    error.status = 413;
    error.expose = true;
    throw error;
  }
  if (extraction.sourceType === "unreadable" || extraction.text.length < 80) {
    const error = new Error("Could not extract readable resume text. If this is a scan, try a clearer PDF.");
    error.status = 422;
    error.expose = true;
    throw error;
  }

  extraction.text = extraction.text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (extraction.text.length < 80) {
    const error = new Error("The PDF does not contain enough readable resume text to analyze.");
    error.status = 422;
    error.expose = true;
    throw error;
  }
  extraction.extractedAt = new Date().toISOString();
  extraction.characterCount = extraction.text.length;
  await saveDocumentExtraction(document.fileUrl, extraction);
  return extraction;
}

function documentId(req, res) {
  if (UUID_PATTERN.test(req.params.id || "")) return req.params.id;
  res.status(400).json({ success: false, message: "Document ID is invalid." });
  return null;
}

function displayTitle(originalName) {
  const safeName = basename(String(originalName || "").replace(/[\\/]/g, "/"))
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 160);
  const title = safeName || "Resume.pdf";
  return extname(title).toLowerCase() === ".pdf" ? title : `${title}.pdf`;
}

export async function listDocuments(req, res, next) {
  try {
    const documents = await prisma.document.findMany({
      where: { userId: req.auth.userId },
      select: DOCUMENT_SELECT,
      orderBy: { createdAt: "desc" },
      take: MAX_DOCUMENTS_PER_USER
    });
    return res.json({ success: true, data: { documents, remainingUploads: Math.max(0, MAX_DOCUMENTS_PER_USER - documents.length) } });
  } catch (error) {
    return next(error);
  }
}

export async function uploadDocument(req, res, next) {
  if (!req.file) return res.status(400).json({ success: false, message: "Choose a PDF file to upload." });
  if (!isValidPdf(req.file.buffer)) return res.status(415).json({ success: false, message: "The file contents are not a valid PDF." });

  let storageKey;
  try {
    const count = await prisma.document.count({ where: { userId: req.auth.userId } });
    if (count >= MAX_DOCUMENTS_PER_USER) {
      return res.status(429).json({ success: false, message: `You can store up to ${MAX_DOCUMENTS_PER_USER} documents.` });
    }

    storageKey = makeStorageKey();
    await saveDocument(storageKey, req.file.buffer);
    const document = await prisma.document.create({
      data: {
        id: randomUUID(),
        userId: req.auth.userId,
        title: displayTitle(req.file.originalname),
        fileUrl: storageKey,
        fileType: "application/pdf",
        updatedAt: new Date()
      },
      select: DOCUMENT_SELECT
    });
    return res.status(201).json({ success: true, data: { document, size: req.file.size } });
  } catch (error) {
    if (storageKey) {
      try {
        await deleteStoredDocument(storageKey);
      } catch (cleanupError) {
        console.error("Could not clean up an incomplete document upload", { errorType: cleanupError.name || "UnknownError" });
      }
    }
    return next(error);
  }
}

export async function downloadDocument(req, res, next) {
  const id = documentId(req, res);
  if (!id) return;
  try {
    const document = await prisma.document.findFirst({ where: { id, userId: req.auth.userId } });
    if (!document) return res.status(404).json({ success: false, message: "Document not found." });
    if (!document.fileUrl) return res.status(404).json({ success: false, message: "Document content is unavailable." });

    const contents = await readDocument(document.fileUrl);
    const downloadName = encodeURIComponent(displayTitle(document.title));
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="resume.pdf"; filename*=UTF-8''${downloadName}`,
      "Content-Length": String(contents.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    });
    return res.send(contents);
  } catch (error) {
    return next(error);
  }
}

export async function analyzeDocument(req, res, next) {
  const id = documentId(req, res);
  if (!id) return;

  const targetRole = req.body?.targetRole === undefined ? "" : req.body.targetRole;
  if (typeof targetRole !== "string" || targetRole.length > MAX_TARGET_ROLE_LENGTH) {
    return res.status(400).json({ success: false, message: `Target role must be no more than ${MAX_TARGET_ROLE_LENGTH} characters.` });
  }

  try {
    const document = await prisma.document.findFirst({
      where: { id, userId: req.auth.userId },
      select: { id: true, title: true, fileUrl: true, fileType: true }
    });
    if (!document) return res.status(404).json({ success: false, message: "Document not found." });
    if (document.fileType !== "application/pdf" || !document.fileUrl) {
      return res.status(415).json({ success: false, message: "This document cannot be analyzed as a PDF." });
    }

    const extraction = await getOrExtractDocumentText(document);

    const analysis = await generateResumeAnalysis(extraction.text, targetRole.trim());
    const history = await prisma.resumeAnalysisRecord.create({
      data: {
        id: randomUUID(), userId: req.auth.userId, sourceTitle: document.title, targetRole: targetRole.trim() || null, analysis,
        extraction: { sourceType: extraction.sourceType, characterCount: extraction.characterCount || extraction.text.length, pageCount: extraction.pageCount }
      }
    });
    return res.json({
      success: true,
      data: {
        analysis,
        historyId: history.id,
        createdAt: history.createdAt,
        sourceTitle: document.title,
        extraction: { sourceType: extraction.sourceType, characterCount: extraction.characterCount || extraction.text.length, pageCount: extraction.pageCount },
        scoreDisclaimer: "AI-generated writing and completeness estimate only. This is not a guaranteed ATS score or hiring prediction."
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function indexDocument(req, res, next) {
  const id = documentId(req, res);
  if (!id) return;
  try {
    const document = await prisma.document.findFirst({
      where: { id, userId: req.auth.userId },
      select: { id: true, title: true, fileType: true, fileUrl: true }
    });
    if (!document) return res.status(404).json({ success: false, message: "Document not found." });
    if (document.fileType !== "application/pdf" || !document.fileUrl) {
      return res.status(415).json({ success: false, message: "This document cannot be indexed as a PDF." });
    }

    const extraction = await getOrExtractDocumentText(document);

    const result = await ingestDocumentChunks({
      documentId: document.id,
      userId: req.auth.userId,
      text: extraction.text,
      title: document.title
    });
    return res.json({ success: true, data: { documentId: document.id, title: document.title, ...result } });
  } catch (error) {
    return next(error);
  }
}

export async function deleteDocument(req, res, next) {
  const id = documentId(req, res);
  if (!id) return;
  try {
    const document = await prisma.document.findFirst({ where: { id, userId: req.auth.userId } });
    if (!document) return res.status(404).json({ success: false, message: "Document not found." });

    if (document.fileUrl) {
      await deleteDocumentExtraction(document.fileUrl);
      await deleteStoredDocument(document.fileUrl);
    }
    await prisma.document.deleteMany({ where: { id, userId: req.auth.userId } });
    return res.json({ success: true, message: "Document deleted." });
  } catch (error) {
    return next(error);
  }
}
