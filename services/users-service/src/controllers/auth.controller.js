import jwt from "jsonwebtoken";
import { db } from "../config/db.js";

export async function login(req, res) {
  const { email, password } = req.body;

  try {
    const [rows] = await db.query(
      `SELECT id, nombre, email, rol, centro, password, status
       FROM usuarios WHERE email = ? LIMIT 1`,
      [email]
    );

    if (rows.length === 0)
      return res.status(400).json({ error: "Credenciales inválidas" });

    const user = rows[0];

    if (user.status !== "active")
      return res.status(403).json({ error: "Usuario inactivo" });

    if (password !== user.password)
      return res.status(400).json({ error: "Credenciales inválidas" });

    // Crear JWT
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        rol: user.rol,
        nombre: user.nombre,
      },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        centro: user.centro,
      },
    });

  } catch (error) {
    console.error("Error login:", error);
    return res.status(500).json({ error: "Error interno" });
  }
}

// Logout dummy (solo para frontend)
export function logout(req, res) {
  return res.json({ message: "Logout exitoso" });
}

// Validar JWT
export function validate(req, res) {
  return res.json({ valid: true, user: req.user });
}
