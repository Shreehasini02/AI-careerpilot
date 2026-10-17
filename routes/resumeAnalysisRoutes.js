import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { resumeAnalysisLimiter } from "../middleware/resumeAnalysisLimiter.js";
import { analyzeResume } from "../controllers/resumeAnalysisController.js";
import { deleteResumeAnalysisHistory, listResumeAnalysisHistory } from "../controllers/analysisHistoryController.js";

const router = Router();

router.use(authenticate);
router.get("/history", listResumeAnalysisHistory);
router.delete("/history/:id", deleteResumeAnalysisHistory);
router.post("/analyze", resumeAnalysisLimiter, analyzeResume);

export default router;
