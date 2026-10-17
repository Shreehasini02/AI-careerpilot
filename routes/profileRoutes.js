import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { getProfile, updateProfile } from "../controllers/profileController.js";

const router = Router();
router.use(authenticate);
router.get("/", getProfile);
router.put("/", updateProfile);
export default router;
