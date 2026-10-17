import { Router } from "express";

const router = Router();

router.get("/health", (_req, res) => {
  res.status(200).json({ success: true, status: "ok", service: "AI CareerPilot API" });
});

export default router;
