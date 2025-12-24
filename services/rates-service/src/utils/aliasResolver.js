const { masterPool } = require('../config/db');

/**
 * Busca el alias y trae la información de la utilidad vinculada
 */
const resolveAlias = async (aliasName) => {
    try {
        const sql = `
            SELECT a.utility_id, u.commodity, u.default_unit, u.unit_gas, u.unit_electric
            FROM Nwfg_master.utility_aliases a
            JOIN Nwfg_master.utilities u ON a.utility_id = u.id
            WHERE UPPER(TRIM(a.alias)) = UPPER(TRIM(?)) 
            AND a.status = 'Active' 
            LIMIT 1
        `;

        const [rows] = await masterPool.query(sql, [aliasName]);

        if (rows.length > 0) {
            return {
                id: rows[0].utility_id,
                commodity: rows[0].commodity,
                defaultUnit: rows[0].default_unit,
                unit_gas: rows[0].unit_gas,
                unit_electric: rows[0].unit_electric
            };
        }
        return null;
    } catch (error) {
        console.error('❌ Error resolving alias:', error);
        return null;
    }
};

module.exports = { resolveAlias };