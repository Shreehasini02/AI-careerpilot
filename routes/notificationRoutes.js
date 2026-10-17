import { Router } from "express";
import { prisma } from "../config/prisma.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();
router.use(authenticate);
router.get("/", async (req, res, next) => {
  try {
    const notifications = await prisma.emailNotification.findMany({
      where: { userId: req.auth.userId },
      select: { id: true, template: true, status: true, attempts: true, lastError: true, sentAt: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
      take: 30
    });
    return res.json({ success: true, data: { notifications } });
  } catch (error) { return next(error); }
});
export default router;
