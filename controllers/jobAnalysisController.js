import { randomUUID } from "node:crypto";
import { prisma } from "../config/prisma.js";
import { generateJobAnalysis } from "../services/geminiService.js";

const MAX_INPUT_LENGTH = 12000;
const MAX_TARGET_ROLE_LENGTH = 120;
const MAX_SKILLS = 40;
const MAX_SKILL_LENGTH = 80;

export async function analyzeJobDescription(req, res, next) {
  const jobDescription = typeof req.body?.jobDescription === "string" ? req.body.jobDescription.trim() : "";
  const resumeText = req.body?.resumeText === undefined ? "" : req.body.resumeText;
  const targetRole = req.body?.targetRole === undefined ? "" : req.body.targetRole;
  const userSkills = req.body?.userSkills === undefined ? [] : req.body.userSkills;

  if (jobDescription.length < 80 || jobDescription.length > MAX_INPUT_LENGTH) {
    return res.status(400).json({ success: false, message: `Job description must contain 80 to ${MAX_INPUT_LENGTH} characters.` });
  }
  if (typeof resumeText !== "string" || resumeText.length > MAX_INPUT_LENGTH || (resumeText.trim() && resumeText.trim().length < 80)) {
    return res.status(400).json({ success: false, message: `Resume text must be empty or contain 80 to ${MAX_INPUT_LENGTH} characters.` });
  }
  if (!Array.isArray(userSkills) || userSkills.length > MAX_SKILLS || userSkills.some((skill) => typeof skill !== "string" || !skill.trim() || skill.length > MAX_SKILL_LENGTH)) {
    return res.status(400).json({ success: false, message: `Provide no more than ${MAX_SKILLS} valid skills, each no more than ${MAX_SKILL_LENGTH} characters.` });
  }
  if (!resumeText.trim() && userSkills.length === 0) {
    return res.status(400).json({ success: false, message: "Provide resume text or at least one skill to compare with the job description." });
  }
  if (typeof targetRole !== "string" || targetRole.length > MAX_TARGET_ROLE_LENGTH) {
    return res.status(400).json({ success: false, message: `Target role must be no more than ${MAX_TARGET_ROLE_LENGTH} characters.` });
  }

  try {
    const analysis = await generateJobAnalysis({
      jobDescription,
      resumeText: resumeText.trim(),
      userSkills: userSkills.map((skill) => skill.trim()),
      targetRole: targetRole.trim()
    });
    const history = await prisma.jobMatchAnalysis.create({
      data: {
        id: randomUUID(),
        userId: req.auth.userId,
        targetRole: targetRole.trim() || null,
        jobDescription,
        analysis
      }
    });
    return res.json({ success: true, data: { analysis, historyId: history.id, createdAt: history.createdAt } });
  } catch (error) {
    return next(error);
  }
}
