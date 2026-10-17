import { prisma } from "../config/prisma.js";

async function loadCareerOverview(userId) {
  const [profile, skillCount, projectCount, linkedProjectCount, documentCount, readyDocumentCount, applicationCount, completedInterviewCount, planCount, applications, interviews, plans, completedTasks, totalTasks] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId }, select: { headline: true, bio: true, targetRole: true, experienceYears: true, location: true, githubUrl: true, linkedinUrl: true } }),
    prisma.userSkill.count({ where: { userId } }),
    prisma.project.count({ where: { userId } }),
    prisma.project.count({ where: { userId, OR: [{ projectUrl: { not: null } }, { githubUrl: { not: null } }] } }),
    prisma.document.count({ where: { userId } }),
    prisma.document.count({ where: { userId, ingestionStatus: "READY" } }),
    prisma.application.count({ where: { userId } }),
    prisma.interview.count({ where: { userId, status: "COMPLETED" } }),
    prisma.studyPlan.count({ where: { userId } }),
    prisma.application.findMany({ where: { userId }, include: { Job: { select: { title: true, company: true } } }, orderBy: { updatedAt: "desc" }, take: 5 }),
    prisma.interview.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, type: true, status: true, score: true, createdAt: true } }),
    prisma.studyPlan.findMany({ where: { userId }, include: { StudyTask: { select: { completed: true } } }, orderBy: { updatedAt: "desc" }, take: 5 }),
    prisma.studyTask.count({ where: { StudyPlan: { is: { userId } }, completed: true } }),
    prisma.studyTask.count({ where: { StudyPlan: { is: { userId } } } })
  ]);
  const profileScore = profile
    ? [profile.headline, profile.bio, profile.targetRole, profile.location, profile.githubUrl || profile.linkedinUrl].filter(Boolean).length
    : 0;
  const readinessItems = [
    { id: "profile", title: "Complete your career profile", detail: "Add a headline, bio, target role, location, and a professional link.", complete: profileScore >= 5, tool: "profile" },
    { id: "skills", title: "Add your skills", detail: "List skills and set a proficiency level for each.", complete: skillCount >= 3, tool: "skills" },
    { id: "resume", title: "Upload and prepare a resume", detail: "Upload a PDF so it can be reviewed and indexed for AI answers.", complete: readyDocumentCount > 0, tool: "documents" },
    { id: "projects", title: "Show evidence of your work", detail: "Add a project and include a live or GitHub link.", complete: linkedProjectCount > 0, tool: "projects" },
    { id: "interview", title: "Practice an interview", detail: "Complete at least one AI interview practice session.", complete: completedInterviewCount > 0, tool: "interview" },
    { id: "applications", title: "Track your job search", detail: "Save a role or record an application in the tracker.", complete: applicationCount > 0, tool: "applications" }
  ];
  return {
    stats: { skills: skillCount, projects: projectCount, documents: documentCount, readyDocuments: readyDocumentCount, applications: applicationCount, completedInterviews: completedInterviewCount, plans: planCount, completedTasks, totalTasks },
    recentApplications: applications,
    recentInterviews: interviews,
    studyPlans: plans.map((plan) => ({ id: plan.id, title: plan.title, completed: plan.StudyTask.filter((task) => task.completed).length, total: plan.StudyTask.length })),
    readiness: { score: Math.round((readinessItems.filter((item) => item.complete).length / readinessItems.length) * 100), completed: readinessItems.filter((item) => item.complete).length, total: readinessItems.length, items: readinessItems }
  };
}

export async function getCareerDashboard(req, res, next) {
  try { return res.json({ success: true, data: await loadCareerOverview(req.auth.userId) }); }
  catch (error) { return next(error); }
}

export async function getCareerReadiness(req, res, next) {
  try { const overview = await loadCareerOverview(req.auth.userId); return res.json({ success: true, data: overview.readiness }); }
  catch (error) { return next(error); }
}

export async function getPortfolioExport(req, res, next) {
  try {
    const [user, profile, skills, projects] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.auth.userId }, select: { name: true } }),
      prisma.userProfile.findUnique({ where: { userId: req.auth.userId }, select: { headline: true, bio: true, targetRole: true, location: true, githubUrl: true, linkedinUrl: true } }),
      prisma.userSkill.findMany({ where: { userId: req.auth.userId }, include: { Skill: { select: { name: true } } }, orderBy: [{ level: "desc" }, { createdAt: "asc" }] }),
      prisma.project.findMany({ where: { userId: req.auth.userId }, orderBy: { createdAt: "desc" }, take: 100 })
    ]);
    return res.json({ success: true, data: { name: user?.name || "Career professional", profile, skills: skills.map((item) => ({ name: item.Skill.name, level: item.level })), projects } });
  } catch (error) { return next(error); }
}
