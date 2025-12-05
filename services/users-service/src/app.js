import express from "express";
import cors from "cors";
import usersRoutes from "./routes/users.routes.js";
import authRoutes from "./routes/auth.routes.js";
import healthRoutes from "./routes/health.routes.js";


const app = express();
app.use("/api/health", healthRoutes);

app.use(cors());
app.use(express.json());

// Registrar rutas
app.use("/api/users", usersRoutes);
app.use("/api/auth", authRoutes);

// Healthcheck
app.get("/health", (req, res) => res.json({ status: "ok" }));

export default app;
