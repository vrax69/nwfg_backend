import { db } from "../config/db.js";

export async function getMe(req, res) {
  try {
    const userId = req.user.id;

    const [[user]] = await db.query(
      `SELECT id, nombre, email, rol, centro
       FROM usuarios WHERE id = ? AND status = 'active'`,
      [userId]
    );

    if (!user)
      return res.status(404).json({ error: "Usuario no encontrado" });

    // Obtener providers del usuario
    const [providers] = await db.query(
      `SELECT up.provider_id, p.nombre,
              up.tpv_id, up.tpv_username, up.status
       FROM user_provider_account up
       JOIN proveedores p ON p.id = up.provider_id
       WHERE up.user_id = ?`,
      [userId]
    );

    return res.json({ ...user, providers });

  } catch (err) {
    console.error("Error getMe:", err);
    return res.status(500).json({ error: "Error obteniendo usuario" });
  }
}
