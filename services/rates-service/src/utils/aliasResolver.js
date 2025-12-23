const { masterPool } = require('../config/db');

/**
 * Busca el alias y trae la información de la utilidad vinculada
 */
const resolveAlias = async (aliasName) => {
    try {
        const sql = `
            SELECT a.utility_id, u.commodity, u.default_unit 
            FROM utility_aliases a
            JOIN master_utilities u ON a.utility_id = u.id
            WHERE a.alias = ? AND a.status = 'Active' 
            LIMIT 1
        `;

        const [rows] = await masterPool.query(sql, [aliasName]);

        if (rows.length > 0) {
            // Devolvemos el objeto completo con la "Verdad" de la DB
            return {
                id: rows[0].utility_id,
                commodity: rows[0].commodity,
                defaultUnit: rows[0].default_unit
            };
        }

        return null;
    } catch (error) {
        console.error('❌ Error resolving alias:', error);
        return null;
    }
};

module.exports = { resolveAlias };