import { prisma } from "../config/prisma.js";

const PROFILE_FIELDS = ["headline", "bio", "targetRole", "location", "githubUrl", "linkedinUrl"];
function optionalText(value, label, max) {
  if (value === undefined || value === null || value === "") return { value: null };
  if (typeof value !== "string" || value.trim().length > max) return { error: `${label} must be no more than ${max} characters.` };
  return { value: value.trim() || null };
}
function optionalUrl(value, label) {
  if (value === undefined || value === null || value === "") return { value: null };
  if (typeof value !== "string" || value.length > 2048) return { error: `${label} must be a valid HTTP or HTTPS URL.` };
  try { const url = new URL(value.trim()); if (!["http:", "https:"].includes(url.protocol)) throw new Error(); return { value: url.toString() }; }
  catch { return { error: `${label} must be a valid HTTP or HTTPS URL.` }; }
}

export async function getProfile(req, res, next) {
  try {
    const [profile, user] = await Promise.all([
      prisma.userProfile.findUnique({ where: { userId: req.auth.userId } }),
      prisma.user.findUnique({ where: { id: req.auth.userId }, select: { name: true, email: true } })
    ]);
    return res.json({ success: true, data: { profile, user } });
  } catch (error) { return next(error); }
}

export async function updateProfile(req, res, next) {
  const data = {};
  for (const field of PROFILE_FIELDS) {
    if (!Object.hasOwn(req.body || {}, field)) continue;
    const result = field.endsWith("Url")
      ? optionalUrl(req.body[field], field === "githubUrl" ? "GitHub URL" : "LinkedIn URL")
      : optionalText(req.body[field], field === "bio" ? "Bio" : field === "headline" ? "Headline" : field === "targetRole" ? "Target role" : "Location", field === "bio" ? 3000 : 180);
    if (result.error) return res.status(400).json({ success: false, message: result.error });
    data[field] = result.value;
  }
  if (Object.hasOwn(req.body || {}, "experienceYears")) {
    const value = req.body.experienceYears;
    if (value !== null && value !== "" && (!Number.isInteger(value) || value < 0 || value > 60)) return res.status(400).json({ success: false, message: "Experience must be a whole number from 0 to 60." });
    data.experienceYears = value === "" ? null : value;
  }
  if (Object.keys(data).length === 0) return res.status(400).json({ success: false, message: "Provide at least one profile field to update." });
  try {
    const profile = await prisma.userProfile.upsert({
      where: { userId: req.auth.userId },
      create: { userId: req.auth.userId, skills: [], ...data, updatedAt: new Date() },
      update: { ...data, updatedAt: new Date() }
    });
    return res.json({ success: true, data: { profile } });
  } catch (error) { return next(error); }
}
