import multer from "multer";
import { extname } from "node:path";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 0, parts: 1, fieldNameSize: 40, headerPairs: 100 },
  fileFilter(_req, file, callback) {
    if (file.mimetype !== "application/pdf" || extname(file.originalname).toLowerCase() !== ".pdf") {
      const error = new Error("Only PDF documents are accepted.");
      error.status = 415;
      error.expose = true;
      callback(error);
      return;
    }
    callback(null, true);
  }
});

export function receivePdf(req, res, next) {
  upload.single("file")(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      return res.status(status).json({ success: false, message: status === 413 ? "PDF must be 5 MB or smaller." : "Upload one PDF file at a time." });
    }
    return res.status(error.status || 400).json({ success: false, message: error.expose ? error.message : "The upload could not be processed." });
  });
}

export function isValidPdf(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 20 || buffer.length > MAX_FILE_SIZE) return false;
  const header = buffer.subarray(0, Math.min(buffer.length, 1024)).toString("latin1");
  const trailer = buffer.subarray(Math.max(0, buffer.length - 2048)).toString("latin1");
  return header.includes("%PDF-") && trailer.includes("%%EOF");
}

export { MAX_FILE_SIZE };
