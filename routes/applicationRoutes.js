import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { createApplication, deleteApplication, listApplications, updateApplication } from "../controllers/applicationController.js";

const router = Router();
router.use(authenticate);
router.get("/", listApplications);
router.post("/", createApplication);
router.patch("/:id", updateApplication);
router.delete("/:id", deleteApplication);

export default router;
