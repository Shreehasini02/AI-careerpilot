import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const DEFAULT_LOCAL_DIRECTORY = fileURLToPath(new URL("../private-uploads/", import.meta.url));
const MAX_DOCUMENTS_PER_USER = 10;
let s3Client;

function publicStorageError(message = "Document storage is temporarily unavailable.") {
  const error = new Error(message);
  error.status = 503;
  error.expose = true;
  return error;
}

function getStorageDriver() {
  const driver = process.env.STORAGE_DRIVER || (process.env.NODE_ENV === "production" ? "s3" : "local");
  if (driver !== "local" && driver !== "s3") throw publicStorageError("Document storage is not configured correctly.");
  return driver;
}

function getLocalPath(key, extension = "pdf") {
  const match = new RegExp(`^local/([0-9a-f-]{36}\\.${extension})$`, "i").exec(key || "");
  if (!match) throw publicStorageError("The stored document reference is invalid.");
  const directory = resolve(process.env.LOCAL_STORAGE_DIR || DEFAULT_LOCAL_DIRECTORY);
  const filePath = resolve(directory, match[1]);
  if (dirname(filePath) !== directory) throw publicStorageError("The stored document reference is invalid.");
  return filePath;
}

function getS3Config() {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw publicStorageError("S3_BUCKET is required when S3 document storage is enabled.");
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!!accessKeyId !== !!secretAccessKey) throw publicStorageError("Configure both S3 access-key variables, or neither when using a host identity.");

  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.S3_REGION || "us-east-1",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(process.env.S3_ENDPOINT),
      credentials: accessKeyId ? { accessKeyId, secretAccessKey } : undefined
    });
  }
  return { bucket, client: s3Client };
}

function objectKey(key, extension = "pdf") {
  const match = new RegExp(`^s3/([0-9a-f-]{36}\\.${extension})$`, "i").exec(key || "");
  if (!match) throw publicStorageError("The stored document reference is invalid.");
  return match[1];
}

function extractionKey(documentKey) {
  const match = /^(local|s3)\/([0-9a-f-]{36})\.pdf$/i.exec(documentKey || "");
  if (!match) throw publicStorageError("The stored document reference is invalid.");
  return { driver: match[1].toLowerCase(), key: `${match[1].toLowerCase()}/${match[2]}.txt`, objectKey: `extractions/${match[2]}.txt` };
}

export function makeStorageKey() {
  const id = randomUUID();
  return getStorageDriver() === "s3" ? `s3/${id}.pdf` : `local/${id}.pdf`;
}

export async function saveDocument(key, buffer) {
  try {
    if (key.startsWith("local/")) {
      const filePath = getLocalPath(key);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, buffer, { flag: "wx", mode: 0o600 });
      return;
    }
    const { bucket, client } = getS3Config();
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey(key), Body: buffer, ContentType: "application/pdf" }));
  } catch (cause) {
    if (cause.expose) throw cause;
    console.error("Document storage write failed", { errorType: cause.name || "UnknownError" });
    throw publicStorageError("The document could not be stored. Please try again.");
  }
}

export async function readDocument(key) {
  try {
    if (key.startsWith("local/")) return await readFile(getLocalPath(key));
    const { bucket, client } = getS3Config();
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey(key) }));
    if (!result.Body) throw new Error("The stored object was empty.");
    return Buffer.from(await result.Body.transformToByteArray());
  } catch (cause) {
    if (cause.expose) throw cause;
    console.error("Document storage read failed", { errorType: cause.name || "UnknownError" });
    throw publicStorageError("The document could not be retrieved. Please try again.");
  }
}

export async function deleteStoredDocument(key) {
  try {
    if (key.startsWith("local/")) {
      try {
        await unlink(getLocalPath(key));
      } catch (cause) {
        if (cause.code !== "ENOENT") throw cause;
      }
      return;
    }
    const { bucket, client } = getS3Config();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey(key) }));
  } catch (cause) {
    if (cause.expose) throw cause;
    console.error("Document storage deletion failed", { errorType: cause.name || "UnknownError" });
    throw publicStorageError("The document could not be deleted from storage. Please try again.");
  }
}

export async function saveDocumentExtraction(documentKey, extraction) {
  const target = extractionKey(documentKey);
  const contents = Buffer.from(JSON.stringify(extraction), "utf8");
  try {
    if (target.driver === "local") {
      const filePath = getLocalPath(target.key, "txt");
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, contents, { mode: 0o600 });
      return;
    }
    const { bucket, client } = getS3Config();
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: target.objectKey, Body: contents, ContentType: "application/json; charset=utf-8" }));
  } catch (cause) {
    if (cause.expose) throw cause;
    console.error("Document text extraction storage failed", { errorType: cause.name || "UnknownError" });
    throw publicStorageError("Extracted resume text could not be stored securely.");
  }
}

export async function readDocumentExtraction(documentKey) {
  const target = extractionKey(documentKey);
  try {
    let contents;
    if (target.driver === "local") {
      try {
        contents = await readFile(getLocalPath(target.key, "txt"));
      } catch (cause) {
        if (cause.code === "ENOENT") return null;
        throw cause;
      }
    } else {
      const { bucket, client } = getS3Config();
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: target.objectKey }));
        if (!result.Body) return null;
        contents = Buffer.from(await result.Body.transformToByteArray());
      } catch (cause) {
        if (cause.name === "NoSuchKey" || cause.$metadata?.httpStatusCode === 404) return null;
        throw cause;
      }
    }
    const extraction = JSON.parse(contents.toString("utf8"));
    return typeof extraction?.text === "string" ? extraction : null;
  } catch (cause) {
    if (cause.expose) throw cause;
    console.error("Document text extraction read failed", { errorType: cause.name || "UnknownError" });
    throw publicStorageError("Previously extracted resume text could not be retrieved.");
  }
}

export async function deleteDocumentExtraction(documentKey) {
  const target = extractionKey(documentKey);
  try {
    if (target.driver === "local") {
      try {
        await unlink(getLocalPath(target.key, "txt"));
      } catch (cause) {
        if (cause.code !== "ENOENT") throw cause;
      }
      return;
    }
    const { bucket, client } = getS3Config();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: target.objectKey }));
  } catch (cause) {
    if (cause.expose) throw cause;
    console.error("Document text extraction deletion failed", { errorType: cause.name || "UnknownError" });
    throw publicStorageError("The extracted resume text could not be deleted.");
  }
}

export { MAX_DOCUMENTS_PER_USER };
