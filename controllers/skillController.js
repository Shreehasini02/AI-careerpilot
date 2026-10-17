import { randomUUID } from "node:crypto";
import { prisma } from "../config/prisma.js";

const LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function titleCaseSkill(value) { return value.trim().replace(/\s+/g, " ").replace(/(^|[\s/+#.-])([a-z])/g, (_, before, letter) => `${before}${letter.toUpperCase()}`); }

export async function listSkills(req, res, next) {
  try {
    const skills = await prisma.userSkill.findMany({ where: { userId: req.auth.userId }, include: { Skill: { select: { id: true, name: true } } }, orderBy: [{ level: "desc" }, { createdAt: "asc" }] });
    return res.json({ success: true, data: { skills } });
  } catch (error) { return next(error); }
}

export async function addSkill(req, res, next) {
  const name = typeof req.body?.name === "string" ? titleCaseSkill(req.body.name) : "";
  const level = req.body?.level === undefined ? "BEGINNER" : req.body.level;
  if (name.length < 2 || name.length > 80) return res.status(400).json({ success: false, message: "Skill name must contain 2 to 80 characters." });
  if (!LEVELS.includes(level)) return res.status(400).json({ success: false, message: "Choose beginner, intermediate, or advanced." });
  try {
    let skill = await prisma.skill.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    if (!skill) {
      try { skill = await prisma.skill.create({ data: { id: randomUUID(), name, updatedAt: new Date() } }); }
      catch (error) {
        if (error.code !== "P2002") throw error;
        skill = await prisma.skill.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
      }
    }
    if (!skill) throw new Error("Skill could not be added.");
    const userSkill = await prisma.userSkill.upsert({
      where: { userId_skillId: { userId: req.auth.userId, skillId: skill.id } },
      create: { id: randomUUID(), userId: req.auth.userId, skillId: skill.id, level, updatedAt: new Date() },
      update: { level, updatedAt: new Date() },
      include: { Skill: { select: { id: true, name: true } } }
    });
    return res.status(201).json({ success: true, data: { skill: userSkill } });
  } catch (error) { return next(error); }
}

export async function updateSkill(req, res, next) {
  const { id } = req.params;
  const level = req.body?.level;
  if (!UUID.test(id || "")) return res.status(400).json({ success: false, message: "Skill ID is invalid." });
  if (!LEVELS.includes(level)) return res.status(400).json({ success: false, message: "Choose beginner, intermediate, or advanced." });
  try {
    const result = await prisma.userSkill.updateMany({ where: { id, userId: req.auth.userId }, data: { level, updatedAt: new Date() } });
    if (!result.count) return res.status(404).json({ success: false, message: "Skill not found." });
    const skill = await prisma.userSkill.findFirst({ where: { id, userId: req.auth.userId }, include: { Skill: { select: { id: true, name: true } } } });
    return res.json({ success: true, data: { skill } });
  } catch (error) { return next(error); }
}

export async function deleteSkill(req, res, next) {
  const { id } = req.params;
  if (!UUID.test(id || "")) return res.status(400).json({ success: false, message: "Skill ID is invalid." });
  try {
    const result = await prisma.userSkill.deleteMany({ where: { id, userId: req.auth.userId } });
    if (!result.count) return res.status(404).json({ success: false, message: "Skill not found." });
    return res.json({ success: true, message: "Skill removed from your profile." });
  } catch (error) { return next(error); }
}
