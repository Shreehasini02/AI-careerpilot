import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { authenticate } from "../middleware/authenticate.js";
import { chat } from "../controllers/aiController.js";

const router = Router();
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.auth.userId,
  message: { success: false, message: "You have reached the chat limit. Try again in 15 minutes." }
});
router.post("/chat", authenticate, chatLimiter, chat);

export default router;
