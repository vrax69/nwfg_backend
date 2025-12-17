// src/utils/aliasResolver.js

const { masterPool } = require('../config/db');

/**
 * Función central para resolver el nombre de la Utility del ratesheet (alias) 
 * a la ID de la Utility estandarizada (utility_id).
 * * El sistema busca una coincidencia exacta en la tabla utility_aliases.
 * * @param {string} splUtilityName - El nombre de la Utility tal como viene en el Ratesheet (SPL).
 * @returns {object|null} Retorna { utility_id, commodity, unit_type } si lo encuentra, o null.
 */
async function resolveAlias(splUtilityName) {
    if (!splUtilityName) {
        return null;
    }

    // Limpia el nombre para prevenir errores de trailing/leading spaces.
    const cleanAlias = splUtilityName.trim();

    try {
        // La búsqueda debe ser exacta (case-insensitive si es posible, pero aquí nos basamos en el trim)
        const [rows] = await masterPool.query(
            `
            SELECT 
                utility_id, 
                commodity,
                unit_type
            FROM utility_aliases
            WHERE alias = ?
            LIMIT 1
            `,
            [cleanAlias]
        );

        if (rows.length > 0) {
            // Devuelve la información clave que necesitamos para la inserción en rates
            return {
                utility_id: rows[0].utility_id,
                commodity: rows[0].commodity,
                unit_type: rows[0].unit_type,
            };
        }

        // Si no se encuentra el alias, el controlador debe marcar la tarifa como 'Pending'
        // y activar el proceso de creación de alias en el Frontend, tal como indica el flujo.
        return null;

    } catch (error) {
        console.error("❌ Error in aliasResolver.js:", error);
        // En caso de error de DB, lo manejamos devolviendo null para no detener la importación
        return null;
    }
}

module.exports = {
    resolveAlias,
};