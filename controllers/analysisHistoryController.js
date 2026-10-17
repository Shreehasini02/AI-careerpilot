import { prisma } from "../config/prisma.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function listResumeAnalysisHistory(req, res, next) {
  try {
    const history = await prisma.resumeAnalysisRecord.findMany({ where: { userId: req.auth.userId }, orderBy: { createdAt: "desc" }, take: 50 });
    return res.json({ success: true, data: { history } });
  } catch (error) { return next(error); }
}

export async function deleteResumeAnalysisHistory(req, res, next) {
  const { id } = req.params;
  if (!UUID.test(id || "")) return res.status(400).json({ success: false, message: "Resume review ID is invalid." });
  try {
    const deleted = await prisma.resumeAnalysisRecord.deleteMany({ where: { id, userId: req.auth.userId } });
    if (!deleted.count) return res.status(404).json({ success: false, message: "Resume review not found." });
    return res.json({ success: true, message: "Resume review deleted." });
  } catch (error) { return next(error); }
}

export async function listJobMatchHistory(req, res, next) {
  try {
    const history = await prisma.jobMatchAnalysis.findMany({ where: { userId: req.auth.userId }, orderBy: { createdAt: "desc" }, take: 50 });
    return res.json({ success: true, data: { history } });
  } catch (error) { return next(error); }
}

export async function deleteJobMatchHistory(req, res, next) {
  const { id } = req.params;
  if (!UUID.test(id || "")) return res.status(400).json({ success: false, message: "Job match ID is invalid." });
  try {
    const deleted = await prisma.jobMatchAnalysis.deleteMany({ where: { id, userId: req.auth.userId } });
    if (!deleted.count) return res.status(404).json({ success: false, message: "Job match not found." });
    return res.json({ success: true, message: "Job match deleted." });
  } catch (error) { return next(error); }
}
