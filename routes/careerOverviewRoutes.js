import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { getCareerDashboard, getCareerReadiness, getPortfolioExport } from "../controllers/careerOverviewController.js";

const router = Router();
router.use(authenticate);
router.get("/dashboard", getCareerDashboard);
router.get("/readiness", getCareerReadiness);
router.get("/portfolio", getPortfolioExport);
export default router;
