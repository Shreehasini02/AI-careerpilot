import { randomUUID } from "node:crypto";
import { prisma } from "../config/prisma.js";
import { generateResumeAnalysis } from "../services/geminiService.js";

const MAX_RESUME_LENGTH = 16000;
const MAX_TARGET_ROLE_LENGTH = 120;

export async function analyzeResume(req, res, next) {
  const resumeText = typeof req.body?.resumeText === "string" ? req.body.resumeText.trim() : "";
  const targetRole = req.body?.targetRole === undefined ? "" : req.body.targetRole;

  if (resumeText.length < 80 || resumeText.length > MAX_RESUME_LENGTH) {
    return res.status(400).json({
      success: false,
      message: `Paste resume text containing 80 to ${MAX_RESUME_LENGTH} characters.`
    });
  }
  if (typeof targetRole !== "string" || targetRole.length > MAX_TARGET_ROLE_LENGTH) {
    return res.status(400).json({
      success: false,
      message: `Target role must be no more than ${MAX_TARGET_ROLE_LENGTH} characters.`
    });
  }

  try {
    const analysis = await generateResumeAnalysis(resumeText, targetRole.trim());
    const history = await prisma.resumeAnalysisRecord.create({
      data: { id: randomUUID(), userId: req.auth.userId, sourceTitle: "Pasted resume", targetRole: targetRole.trim() || null, analysis }
    });
    return res.json({
      success: true,
      data: {
        analysis,
        historyId: history.id,
        createdAt: history.createdAt,
        scoreDisclaimer: "AI-generated writing and completeness estimate only. This is not a guaranteed ATS score or hiring prediction."
      }
    });
  } catch (error) {
    return next(error);
  }
}
