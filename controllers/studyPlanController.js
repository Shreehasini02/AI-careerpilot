import { randomUUID } from "node:crypto";
import { prisma } from "../config/prisma.js";
import { generateLearningRoadmap } from "../services/geminiService.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLAN_STATUSES = ["ACTIVE", "PAUSED", "ARCHIVED"];
const PLAN_INCLUDE = { StudyTask: { orderBy: [{ completed: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }] } };
function addProgress(plan) {
  const tasks = plan.StudyTask || [];
  const completed = tasks.filter((task) => task.completed).length;
  return { ...plan, progress: { completed, total: tasks.length, percent: tasks.length ? Math.round((completed / tasks.length) * 100) : 0 } };
}
function parseDate(value, field) {
  if (value === undefined || value === null || value === "") return { value: null };
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? { error: `${field} must be a valid date.` } : { value: date };
}

export async function listStudyPlans(req, res, next) {
  try {
    const plans = await prisma.studyPlan.findMany({ where: { userId: req.auth.userId }, include: PLAN_INCLUDE, orderBy: { updatedAt: "desc" }, take: 50 });
    return res.json({ success: true, data: { plans: plans.map(addProgress) } });
  } catch (error) { return next(error); }
}

export async function createStudyPlan(req, res, next) {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (title.length < 2 || title.length > 160) return res.status(400).json({ success: false, message: "Plan title must contain 2 to 160 characters." });
  const description = req.body?.description;
  if (description != null && (typeof description !== "string" || description.trim().length > 2000)) return res.status(400).json({ success: false, message: "Description must be no more than 2,000 characters." });
  const start = parseDate(req.body?.startDate, "Start date");
  const end = parseDate(req.body?.endDate, "End date");
  if (start.error || end.error) return res.status(400).json({ success: false, message: start.error || end.error });
  if (start.value && end.value && end.value < start.value) return res.status(400).json({ success: false, message: "End date must be on or after the start date." });
  try {
    const now = new Date();
    const plan = await prisma.studyPlan.create({ data: { id: randomUUID(), userId: req.auth.userId, title, description: description?.trim() || null, startDate: start.value, endDate: end.value, updatedAt: now }, include: PLAN_INCLUDE });
    return res.status(201).json({ success: true, data: { plan: addProgress(plan) } });
  } catch (error) { return next(error); }
}

export async function generateStudyPlan(req, res, next) {
  const requestedRole = typeof req.body?.targetRole === "string" ? req.body.targetRole.trim() : "";
  const durationWeeks = req.body?.durationWeeks === undefined ? 6 : req.body.durationWeeks;
  const availableHoursPerWeek = req.body?.availableHoursPerWeek === undefined ? 5 : req.body.availableHoursPerWeek;
  const skillGaps = req.body?.skillGaps === undefined ? [] : req.body.skillGaps;
  const requestKey = req.body?.requestKey;
  if (requestedRole.length > 120) return res.status(400).json({ success: false, message: "Target role must be no more than 120 characters." });
  if (!Number.isInteger(durationWeeks) || durationWeeks < 2 || durationWeeks > 12) return res.status(400).json({ success: false, message: "Choose a roadmap length from 2 to 12 weeks." });
  if (!Number.isInteger(availableHoursPerWeek) || availableHoursPerWeek < 1 || availableHoursPerWeek > 40) return res.status(400).json({ success: false, message: "Available study time must be from 1 to 40 hours per week." });
  if (!Array.isArray(skillGaps) || skillGaps.length > 20 || skillGaps.some((gap) => typeof gap !== "string" || !gap.trim() || gap.trim().length > 120)) return res.status(400).json({ success: false, message: "Provide no more than 20 skill gaps, each no more than 120 characters." });
  if (typeof requestKey !== "string" || !UUID.test(requestKey)) return res.status(400).json({ success: false, message: "A valid request key is required so repeated submissions do not create duplicate plans." });
  try {
    const previous = await prisma.studyPlan.findUnique({ where: { userId_requestKey: { userId: req.auth.userId, requestKey } }, include: PLAN_INCLUDE });
    if (previous) return res.status(200).json({ success: true, data: { plan: addProgress(previous), idempotentReplay: true } });
    const [profile, userSkills] = await Promise.all([
      prisma.userProfile.findUnique({ where: { userId: req.auth.userId }, select: { targetRole: true } }),
      prisma.userSkill.findMany({ where: { userId: req.auth.userId }, include: { Skill: { select: { name: true } } }, take: 30 })
    ]);
    const targetRole = requestedRole || profile?.targetRole || "";
    if (!targetRole) return res.status(400).json({ success: false, message: "Enter a target role or add one to your Career Profile first." });
    const normalizedGaps = skillGaps.map((gap) => gap.trim());
    const roadmap = await generateLearningRoadmap({
      targetRole,
      skills: userSkills.map((item) => ({ name: item.Skill.name, level: item.level })),
      skillGaps: normalizedGaps,
      durationWeeks,
      availableHoursPerWeek
    });
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + durationWeeks * 7);
    const plan = await prisma.studyPlan.create({
      data: {
        id: randomUUID(), userId: req.auth.userId, title: roadmap.title, description: roadmap.description,
        targetRole, durationWeeks, availableHoursPerWeek, skillGaps: normalizedGaps, requestKey, status: "ACTIVE",
        startDate: now, endDate, updatedAt: now,
        StudyTask: { create: roadmap.tasks.map((task) => {
          const dueDate = new Date(now);
          dueDate.setDate(dueDate.getDate() + task.week * 7 - 1);
          return { id: randomUUID(), title: `Week ${task.week}: ${task.title}`, description: task.description, week: task.week, estimatedMinutes: task.estimatedMinutes, dueDate, updatedAt: now };
        }) }
      },
      include: PLAN_INCLUDE
    });
    return res.status(201).json({ success: true, data: { plan: addProgress(plan) } });
  } catch (error) {
    if (error.code === "P2002") {
      try {
        const previous = await prisma.studyPlan.findUnique({ where: { userId_requestKey: { userId: req.auth.userId, requestKey } }, include: PLAN_INCLUDE });
        if (previous) return res.status(200).json({ success: true, data: { plan: addProgress(previous), idempotentReplay: true } });
      } catch (lookupError) { return next(lookupError); }
    }
    return next(error);
  }
}

export async function updateStudyPlan(req, res, next) {
  const { id } = req.params;
  if (!UUID.test(id || "")) return res.status(400).json({ success: false, message: "Study plan ID is invalid." });
  const data = {};
  if (Object.hasOwn(req.body || {}, "title")) {
    const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
    if (title.length < 2 || title.length > 160) return res.status(400).json({ success: false, message: "Plan title must contain 2 to 160 characters." });
    data.title = title;
  }
  if (Object.hasOwn(req.body || {}, "description")) {
    if (req.body.description !== null && (typeof req.body.description !== "string" || req.body.description.trim().length > 2000)) return res.status(400).json({ success: false, message: "Description must be no more than 2,000 characters." });
    data.description = req.body.description?.trim() || null;
  }
  if (Object.hasOwn(req.body || {}, "status")) {
    if (!PLAN_STATUSES.includes(req.body.status)) return res.status(400).json({ success: false, message: "Plan status must be ACTIVE, PAUSED, or ARCHIVED." });
    data.status = req.body.status;
  }
  if (Object.hasOwn(req.body || {}, "startDate")) {
    const start = parseDate(req.body.startDate, "Start date");
    if (start.error) return res.status(400).json({ success: false, message: start.error });
    data.startDate = start.value;
  }
  if (Object.hasOwn(req.body || {}, "endDate")) {
    const end = parseDate(req.body.endDate, "End date");
    if (end.error) return res.status(400).json({ success: false, message: end.error });
    data.endDate = end.value;
  }
  if (!Object.keys(data).length) return res.status(400).json({ success: false, message: "Provide at least one plan field to update." });

  try {
    const existing = await prisma.studyPlan.findFirst({ where: { id, userId: req.auth.userId } });
    if (!existing) return res.status(404).json({ success: false, message: "Study plan not found." });
    const startDate = data.startDate === undefined ? existing.startDate : data.startDate;
    const endDate = data.endDate === undefined ? existing.endDate : data.endDate;
    if (startDate && endDate && endDate < startDate) return res.status(400).json({ success: false, message: "End date must be on or after the start date." });
    const plan = await prisma.studyPlan.update({ where: { id }, data: { ...data, updatedAt: new Date() }, include: PLAN_INCLUDE });
    return res.json({ success: true, data: { plan: addProgress(plan) } });
  } catch (error) { return next(error); }
}

export async function regenerateStudyPlanWeeks(req, res, next) {
  const { id } = req.params;
  const weeks = req.body?.weeks;
  if (!UUID.test(id || "")) return res.status(400).json({ success: false, message: "Study plan ID is invalid." });
  if (!Array.isArray(weeks) || !weeks.length || weeks.length > 12 || weeks.some((week) => !Number.isInteger(week) || week < 1 || week > 12) || new Set(weeks).size !== weeks.length) {
    return res.status(400).json({ success: false, message: "Choose one or more unique plan weeks to regenerate." });
  }
  try {
    const plan = await prisma.studyPlan.findFirst({ where: { id, userId: req.auth.userId }, include: PLAN_INCLUDE });
    if (!plan) return res.status(404).json({ success: false, message: "Study plan not found." });
    if (plan.status === "ARCHIVED") return res.status(409).json({ success: false, message: "Archived plans cannot be regenerated." });
    const durationWeeks = plan.durationWeeks || Math.max(...weeks);
    if (weeks.some((week) => week > durationWeeks)) return res.status(400).json({ success: false, message: "A selected week is outside this plan." });
    const selected = new Set(weeks);
    const completedWeeks = new Set(plan.StudyTask.filter((task) => task.completed && selected.has(task.week)).map((task) => task.week));
    const replaceWeeks = weeks.filter((week) => !completedWeeks.has(week));
    if (!replaceWeeks.length) return res.json({ success: true, data: { plan: addProgress(plan), preservedCompletedTasks: true } });
    const userSkills = await prisma.userSkill.findMany({ where: { userId: req.auth.userId }, include: { Skill: { select: { name: true } } }, take: 30 });
    const roadmap = await generateLearningRoadmap({
      targetRole: plan.targetRole || plan.title,
      skills: userSkills.map((item) => ({ name: item.Skill.name, level: item.level })),
      skillGaps: Array.isArray(plan.skillGaps) ? plan.skillGaps : [],
      durationWeeks,
      availableHoursPerWeek: plan.availableHoursPerWeek || 5
    });
    const replacements = roadmap.tasks.filter((task) => replaceWeeks.includes(task.week));
    if (!replacements.length) return res.status(502).json({ success: false, message: "The roadmap generator did not return tasks for the selected weeks. Try again." });
    const oldIds = plan.StudyTask.filter((task) => !task.completed && replaceWeeks.includes(task.week)).map((task) => task.id);
    const now = new Date();
    const tasks = replacements.map((task) => {
      const dueDate = new Date(plan.startDate || now);
      dueDate.setDate(dueDate.getDate() + task.week * 7 - 1);
      return { id: randomUUID(), studyPlanId: id, title: `Week ${task.week}: ${task.title}`, description: task.description, week: task.week, estimatedMinutes: task.estimatedMinutes, dueDate, updatedAt: now };
    });
    const updated = await prisma.$transaction(async (tx) => {
      await tx.studyTask.deleteMany({ where: { id: { in: oldIds }, studyPlanId: id } });
      await tx.studyTask.createMany({ data: tasks });
      return tx.studyPlan.findFirst({ where: { id, userId: req.auth.userId }, include: PLAN_INCLUDE });
    });
    return res.json({ success: true, data: { plan: addProgress(updated), preservedCompletedTasks: true } });
  } catch (error) { return next(error); }
}

export async function createStudyTask(req, res, next) {
  const { id } = req.params;
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (!UUID.test(id || "")) return res.status(400).json({ success: false, message: "Study plan ID is invalid." });
  if (title.length < 2 || title.length > 180) return res.status(400).json({ success: false, message: "Task title must contain 2 to 180 characters." });
  const description = req.body?.description;
  if (description != null && (typeof description !== "string" || description.trim().length > 2000)) return res.status(400).json({ success: false, message: "Task description must be no more than 2,000 characters." });
  const due = parseDate(req.body?.dueDate, "Due date");
  if (due.error) return res.status(400).json({ success: false, message: due.error });
  try {
    const plan = await prisma.studyPlan.findFirst({ where: { id, userId: req.auth.userId }, select: { id: true, status: true } });
    if (!plan) return res.status(404).json({ success: false, message: "Study plan not found." });
    if (plan.status === "ARCHIVED") return res.status(409).json({ success: false, message: "Archived plans cannot be changed." });
    const now = new Date();
    const task = await prisma.studyTask.create({ data: { id: randomUUID(), studyPlanId: id, title, description: description?.trim() || null, dueDate: due.value, updatedAt: now } });
    return res.status(201).json({ success: true, data: { task } });
  } catch (error) { return next(error); }
}

export async function updateStudyTask(req, res, next) {
  const { taskId } = req.params;
  if (!UUID.test(taskId || "")) return res.status(400).json({ success: false, message: "Task ID is invalid." });
  if (typeof req.body?.completed !== "boolean") return res.status(400).json({ success: false, message: "Completed must be true or false." });
  try {
    const task = await prisma.studyTask.findFirst({ where: { id: taskId, StudyPlan: { is: { userId: req.auth.userId } } }, include: { StudyPlan: { select: { status: true } } } });
    if (!task) return res.status(404).json({ success: false, message: "Study task not found." });
    if (task.StudyPlan.status === "ARCHIVED") return res.status(409).json({ success: false, message: "Archived plans cannot be changed." });
    const updated = await prisma.studyTask.update({ where: { id: taskId }, data: { completed: req.body.completed, updatedAt: new Date() } });
    return res.json({ success: true, data: { task: updated } });
  } catch (error) { return next(error); }
}

export async function deleteStudyPlan(req, res, next) {
  const { id } = req.params;
  if (!UUID.test(id || "")) return res.status(400).json({ success: false, message: "Study plan ID is invalid." });
  try {
    const owned = await prisma.studyPlan.findFirst({ where: { id, userId: req.auth.userId }, select: { id: true } });
    if (!owned) return res.status(404).json({ success: false, message: "Study plan not found." });
    await prisma.$transaction([
      prisma.studyTask.deleteMany({ where: { studyPlanId: id } }),
      prisma.studyPlan.deleteMany({ where: { id, userId: req.auth.userId } })
    ]);
    return res.json({ success: true, message: "Study plan deleted." });
  } catch (error) { return next(error); }
}
