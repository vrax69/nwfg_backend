import { db } from "../config/db.js";
import jwt from "jsonwebtoken";

/* ============================================
   LOGIN REAL CONTRA BASE DE DATOS
============================================ */
export async function login(req, res) {
  try {
    const { email, password } = req.body;

    const [rows] = await db.query(
      "SELECT * FROM users WHERE email = ? AND password = ?",
      [email, password]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const user = rows[0];

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    return res.json({ token, user });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/* ============================================
   REGISTER MOCK (TEMPORAL) — SOLO PARA QUE ARRANQUE
============================================ */
export async function register(req, res) {
  const { email, password } = req.body;

  return res.json({
    msg: "Usuario registrado (mock, pendiente lógica real)",
    user: { id: Date.now(), email }
  });
}
