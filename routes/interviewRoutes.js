import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { authenticate } from "../middleware/authenticate.js";
import { endInterview, listInterviews, startInterview, submitInterviewAnswer } from "../controllers/interviewController.js";

const router = Router();
router.use(authenticate);
router.get("/", listInterviews);
router.post("/", rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => req.auth.userId }), startInterview);
router.post("/:id/answers", rateLimit({ windowMs: 15 * 60 * 1000, limit: 25, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => req.auth.userId }), submitInterviewAnswer);
router.post("/:id/end", endInterview);

export default router;
