import { rateLimit } from "express-rate-limit";

const resumeAnalysisLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.auth.userId,
  message: { success: false, message: "You have reached the resume-analysis limit. Try again in 15 minutes." }
});

export { resumeAnalysisLimiter };
