import { randomUUID } from "node:crypto";
import { prisma } from "../config/prisma.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function optionalUrl(value, name) {
  if (value === undefined || value === null || value === "") return { value: null };
  if (typeof value !== "string" || value.length > 2048) return { error: `${name} must be a valid HTTP or HTTPS URL.` };
  try { const url = new URL(value.trim()); if (!["http:", "https:"].includes(url.protocol)) throw new Error(); return { value: url.toString() }; }
  catch { return { error: `${name} must be a valid HTTP or HTTPS URL.` }; }
}
function validateProject(body) {
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (title.length < 2 || title.length > 160) return { error: "Project title must contain 2 to 160 characters." };
  const description = body?.description;
  if (description != null && (typeof description !== "string" || description.trim().length > 4000)) return { error: "Description must be no more than 4,000 characters." };
  const technologies = body?.technologies === undefined ? [] : body.technologies;
  if (!Array.isArray(technologies) || technologies.length > 30 || technologies.some((item) => typeof item !== "string" || item.trim().length > 60)) return { error: "Enter up to 30 technologies, each no more than 60 characters." };
  const projectUrl = optionalUrl(body?.projectUrl, "Project URL");
  const githubUrl = optionalUrl(body?.githubUrl, "GitHub URL");
  if (projectUrl.error || githubUrl.error) return { error: projectUrl.error || githubUrl.error };
  return { value: { title, description: description?.trim() || null, technologies: [...new Set(technologies.map((item) => item.trim()).filter(Boolean))], projectUrl: projectUrl.value, githubUrl: githubUrl.value } };
}

export async function listProjects(req, res, next) {
  try {
    const projects = await prisma.project.findMany({ where: { userId: req.auth.userId }, orderBy: { updatedAt: "desc" }, take: 100 });
    return res.json({ success: true, data: { projects } });
  } catch (error) { return next(error); }
}

export async function createProject(req, res, next) {
  const result = validateProject(req.body);
  if (result.error) return res.status(400).json({ success: false, message: result.error });
  try {
    const project = await prisma.project.create({ data: { id: randomUUID(), userId: req.auth.userId, ...result.value, updatedAt: new Date() } });
    return res.status(201).json({ success: true, data: { project } });
  } catch (error) { return next(error); }
}

export async function updateProject(req, res, next) {
  const { id } = req.params;
  if (!UUID.test(id || "")) return res.status(400).json({ success: false, message: "Project ID is invalid." });
  const result = validateProject(req.body);
  if (result.error) return res.status(400).json({ success: false, message: result.error });
  try {
    const updated = await prisma.project.updateMany({ where: { id, userId: req.auth.userId }, data: { ...result.value, updatedAt: new Date() } });
    if (!updated.count) return res.status(404).json({ success: false, message: "Project not found." });
    const project = await prisma.project.findFirst({ where: { id, userId: req.auth.userId } });
    return res.json({ success: true, data: { project } });
  } catch (error) { return next(error); }
}

export async function deleteProject(req, res, next) {
  const { id } = req.params;
  if (!UUID.test(id || "")) return res.status(400).json({ success: false, message: "Project ID is invalid." });
  try {
    const result = await prisma.project.deleteMany({ where: { id, userId: req.auth.userId } });
    if (!result.count) return res.status(404).json({ success: false, message: "Project not found." });
    return res.json({ success: true, message: "Project deleted." });
  } catch (error) { return next(error); }
}
