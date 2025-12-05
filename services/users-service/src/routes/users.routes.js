import { Router } from "express";
import { getUsers, getUserById } from "../controllers/users.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";

const router = Router();

// Todas requieren token
router.get("/", authMiddleware, getUsers);
router.get("/:id", authMiddleware, getUserById);

export default router;
