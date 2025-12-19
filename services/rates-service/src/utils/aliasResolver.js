const { masterPool } = require('../config/db');

/**
 * Busca si un nombre de utilidad (alias) ya está mapeado a una Utility real.
 */
const resolveAlias = async (aliasName) => {
    try {
        // 1. Usamos 'alias' (nombre real en tu DB)
        // 2. Filtramos por status 'Active' para mayor seguridad
        const sql = `
      SELECT utility_id 
      FROM utility_aliases 
      WHERE alias = ? AND status = 'Active' 
      LIMIT 1
    `;

        const [rows] = await masterPool.query(sql, [aliasName]);

        if (rows.length > 0) {
            // Retornamos el ID directamente para que el controlador lo use
            return rows[0].utility_id;
        }

        return null; // No se reconoció el alias
    } catch (error) {
        console.error('❌ Error resolving alias:', error);
        return null;
    }
};

module.exports = { resolveAlias };