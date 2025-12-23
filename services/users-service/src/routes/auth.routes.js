import { Router } from "express";
import { login, logout, validate, verifyTokenResponse } from "../controllers/auth.controller.js";
import { authMiddleware as authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/login", login);
router.post("/logout", authenticate, logout);
router.get("/validate", authenticate, validate);

// Esta es la ruta que el upload-service busca como /api/auth/verify
router.get('/verify', authenticate, verifyTokenResponse);

export default router;
