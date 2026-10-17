import "dotenv/config";
import express from "express";
import cors from "cors";
import aiRoutes from "./routes/aiRoutes.js";
import resumeAnalysisRoutes from "./routes/resumeAnalysisRoutes.js";
import jobAnalysisRoutes from "./routes/jobAnalysisRoutes.js";
import documentRoutes from "./routes/documentRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import interviewRoutes from "./routes/interviewRoutes.js";
import applicationRoutes from "./routes/applicationRoutes.js";
import studyPlanRoutes from "./routes/studyPlanRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import skillRoutes from "./routes/skillRoutes.js";
import careerOverviewRoutes from "./routes/careerOverviewRoutes.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import { serve } from "inngest/express";
import { inngest } from "./inngest/client.js";
import { inngestFunctions } from "./inngest/functions.js";

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

// Allow the configured client and Vite's localhost ports when its default port is busy.
app.use(cors({
  origin(origin, callback) {
    const isConfiguredClient = origin === CLIENT_URL;
    const isLocalViteClient = process.env.NODE_ENV !== "production" &&
      /^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(origin || "");

    if (!origin || isConfiguredClient || isLocalViteClient) {
      return callback(null, true);
    }
    return callback(new Error("Origin is not allowed by CORS."));
  }
}));

// Convert incoming JSON request bodies into req.body.
app.use(express.json({ limit: "128kb" }));

// Inngest's Express adapter uses this JSON parser and its signed endpoint.
app.use("/api/inngest", serve({ client: inngest, functions: inngestFunctions }));

// Every API route lives under /api.
app.use("/api", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/resume", resumeAnalysisRoutes);
app.use("/api/job-analysis", jobAnalysisRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/interviews", interviewRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/study-plans", studyPlanRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/skills", skillRoutes);
app.use("/api/career", careerOverviewRoutes);
app.use("/api/notifications", notificationRoutes);

// These two must come after all the routes.
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
