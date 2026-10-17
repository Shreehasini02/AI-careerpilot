import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { createStudyPlan, createStudyTask, deleteStudyPlan, generateStudyPlan, listStudyPlans, regenerateStudyPlanWeeks, updateStudyPlan, updateStudyTask } from "../controllers/studyPlanController.js";
import { rateLimit } from "express-rate-limit";

const router = Router();
router.use(authenticate);
router.get("/", listStudyPlans);
router.post("/", createStudyPlan);
router.post("/generate", rateLimit({ windowMs: 15 * 60 * 1000, limit: 4, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => req.auth.userId }), generateStudyPlan);
router.patch("/:id", updateStudyPlan);
router.post("/:id/regenerate", rateLimit({ windowMs: 15 * 60 * 1000, limit: 4, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => req.auth.userId }), regenerateStudyPlanWeeks);
router.post("/:id/tasks", createStudyTask);
router.patch("/tasks/:taskId", updateStudyTask);
router.delete("/:id", deleteStudyPlan);
export default router;
