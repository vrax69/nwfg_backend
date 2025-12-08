import { Router } from "express";
import { login, logout, validate } from "../controllers/auth.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/login", login);
router.post("/logout", authMiddleware, logout);
router.get("/validate", authMiddleware, validate);

export default router;
