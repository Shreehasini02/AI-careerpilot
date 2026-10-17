import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { authenticate } from "../middleware/authenticate.js";
import { receivePdf } from "../middleware/pdfUpload.js";
import { resumeAnalysisLimiter } from "../middleware/resumeAnalysisLimiter.js";
import { analyzeDocument, deleteDocument, downloadDocument, indexDocument, listDocuments, uploadDocument } from "../controllers/documentController.js";

const router = Router();
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.auth.userId,
  message: { success: false, message: "You have reached the upload limit. Try again in 15 minutes." }
});
router.use(authenticate);
router.get("/", listDocuments);
router.post("/", uploadLimiter, receivePdf, uploadDocument);
router.post("/:id/analyze", resumeAnalysisLimiter, analyzeDocument);
router.post("/:id/index", resumeAnalysisLimiter, indexDocument);
router.get("/:id/download", downloadDocument);
router.delete("/:id", deleteDocument);

export default router;
