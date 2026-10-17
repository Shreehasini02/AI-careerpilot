import { randomUUID } from "node:crypto";
import { prisma } from "../config/prisma.js";

const STATUSES = ["SAVED", "APPLIED", "OA", "INTERVIEW", "OFFER", "REJECTED"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JOB_SELECT = { id: true, title: true, company: true, description: true, location: true, jobUrl: true, createdAt: true };

function optionalText(value, field, maxLength) {
  if (value === undefined || value === null || value === "") return { value: null };
  if (typeof value !== "string" || value.trim().length > maxLength) return { error: `${field} must be no more than ${maxLength} characters.` };
  return { value: value.trim() || null };
}

function validJobUrl(value) {
  if (value === undefined || value === null || value === "") return { value: null };
  if (typeof value !== "string" || value.length > 2048) return { error: "Job URL must be no more than 2,048 characters." };
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("invalid protocol");
    return { value: url.toString() };
  } catch {
    return { error: "Enter a valid HTTP or HTTPS job URL." };
  }
}

export async function listApplications(req, res, next) {
  try {
    const applications = await prisma.application.findMany({
      where: { userId: req.auth.userId },
      include: { Job: { select: JOB_SELECT } },
      orderBy: { updatedAt: "desc" },
      take: 100
    });
    return res.json({ success: true, data: { applications } });
  } catch (error) {
    return next(error);
  }
}

export async function createApplication(req, res, next) {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const company = typeof req.body?.company === "string" ? req.body.company.trim() : "";
  const status = req.body?.status === undefined ? "SAVED" : req.body.status;
  if (title.length < 2 || title.length > 160) return res.status(400).json({ success: false, message: "Job title must contain 2 to 160 characters." });
  if (company.length < 2 || company.length > 160) return res.status(400).json({ success: false, message: "Company must contain 2 to 160 characters." });
  if (!STATUSES.includes(status)) return res.status(400).json({ success: false, message: "Choose a valid application status." });

  const description = optionalText(req.body?.description, "Description", 12000);
  const location = optionalText(req.body?.location, "Location", 160);
  const notes = optionalText(req.body?.notes, "Notes", 4000);
  const jobUrl = validJobUrl(req.body?.jobUrl);
  const validationError = [description, location, notes, jobUrl].find((item) => item.error)?.error;
  if (validationError) return res.status(400).json({ success: false, message: validationError });

  try {
    const now = new Date();
    const application = await prisma.$transaction(async (tx) => {
      const job = await tx.job.create({
        data: {
          id: randomUUID(),
          userId: req.auth.userId,
          title,
          company,
          description: description.value,
          location: location.value,
          jobUrl: jobUrl.value,
          updatedAt: now
        }
      });
      return tx.application.create({
        data: {
          id: randomUUID(),
          userId: req.auth.userId,
          jobId: job.id,
          status,
          appliedAt: status === "APPLIED" ? now : null,
          notes: notes.value,
          updatedAt: now
        },
        include: { Job: { select: JOB_SELECT } }
      });
    });
    return res.status(201).json({ success: true, data: { application } });
  } catch (error) {
    return next(error);
  }
}

export async function updateApplication(req, res, next) {
  const { id } = req.params;
  if (!UUID_PATTERN.test(id || "")) return res.status(400).json({ success: false, message: "Application ID is invalid." });
  const hasStatus = Object.hasOwn(req.body || {}, "status");
  const hasNotes = Object.hasOwn(req.body || {}, "notes");
  if (!hasStatus && !hasNotes) return res.status(400).json({ success: false, message: "Provide a status or notes update." });
  if (hasStatus && !STATUSES.includes(req.body.status)) return res.status(400).json({ success: false, message: "Choose a valid application status." });
  const notes = hasNotes ? optionalText(req.body.notes, "Notes", 4000) : null;
  if (notes?.error) return res.status(400).json({ success: false, message: notes.error });

  try {
    const current = await prisma.application.findFirst({ where: { id, userId: req.auth.userId } });
    if (!current) return res.status(404).json({ success: false, message: "Application not found." });
    const now = new Date();
    const data = { updatedAt: now };
    if (hasStatus) {
      data.status = req.body.status;
      if (req.body.status === "APPLIED" && !current.appliedAt) data.appliedAt = now;
    }
    if (hasNotes) data.notes = notes.value;
    const application = await prisma.application.update({
      where: { id },
      data,
      include: { Job: { select: JOB_SELECT } }
    });
    return res.json({ success: true, data: { application } });
  } catch (error) {
    return next(error);
  }
}

export async function deleteApplication(req, res, next) {
  const { id } = req.params;
  if (!UUID_PATTERN.test(id || "")) return res.status(400).json({ success: false, message: "Application ID is invalid." });
  try {
    const current = await prisma.application.findFirst({ where: { id, userId: req.auth.userId } });
    if (!current) return res.status(404).json({ success: false, message: "Application not found." });
    await prisma.$transaction([
      prisma.application.deleteMany({ where: { id, userId: req.auth.userId } }),
      prisma.job.deleteMany({ where: { id: current.jobId, userId: req.auth.userId } })
    ]);
    return res.json({ success: true, message: "Application deleted." });
  } catch (error) {
    return next(error);
  }
}
