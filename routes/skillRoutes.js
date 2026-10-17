import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { addSkill, deleteSkill, listSkills, updateSkill } from "../controllers/skillController.js";

const router = Router();
router.use(authenticate);
router.get("/", listSkills);
router.post("/", addSkill);
router.patch("/:id", updateSkill);
router.delete("/:id", deleteSkill);
export default router;
