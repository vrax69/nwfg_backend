import { db } from "../config/db.js";

// Obtener todos los usuarios
export async function getUsers(req, res) {
  try {
    const [rows] = await db.query("SELECT id, email, created_at FROM users LIMIT 50");
    return res.json(rows);

  } catch (err) {
    console.error("Error getUsers:", err);
    return res.status(500).json({ error: "Error obteniendo usuarios" });
  }
}

// Obtener un usuario por ID
export async function getUserById(req, res) {
  const { id } = req.params;

  try {
    const [rows] = await db.query(
      "SELECT id, email, created_at FROM users WHERE id = ?",
      [id]
    );

    if (rows.length === 0)
      return res.status(404).json({ error: "Usuario no encontrado" });

    return res.json(rows[0]);

  } catch (err) {
    console.error("Error getUserById:", err);
    return res.status(500).json({ error: "Error obteniendo usuario" });
  }
}
