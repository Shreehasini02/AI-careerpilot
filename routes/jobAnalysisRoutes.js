import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { authenticate } from "../middleware/authenticate.js";
import { analyzeJobDescription } from "../controllers/jobAnalysisController.js";
import { deleteJobMatchHistory, listJobMatchHistory } from "../controllers/analysisHistoryController.js";

const router = Router();
const jobAnalysisLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.auth.userId,
  message: { success: false, message: "You have reached the job-analysis limit. Try again in 15 minutes." }
});

router.use(authenticate);
router.get("/history", listJobMatchHistory);
router.delete("/history/:id", deleteJobMatchHistory);
router.post("/analyze", jobAnalysisLimiter, analyzeJobDescription);

export default router;
