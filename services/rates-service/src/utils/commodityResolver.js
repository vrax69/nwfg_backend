// src/utils/commodityResolver.js

const UtilitiesModel = require('../models/utilities.model');

/**
 * Resuelve el tipo de commodity (Electric o Gas) de una tarifa,
 * usando la data del ratesheet y la metadata de la Utility.
 * @param {string} incomingCommodity - El valor de 'Commodity' que viene directamente del ratesheet (puede ser null, vacío o un valor no estandarizado).
 * @param {number} utilityId - El ID de la Utility estandarizada (ya resuelto por aliasResolver).
 * @param {object} rateData - El objeto de datos normalizados (se usa para ver si trae 'KWH' o 'CCF' en unit_type).
 * @returns {string|null} 'Electric', 'Gas', o null si no puede determinarlo.
 */
async function resolveCommodity(incomingCommodity, utilityId, rateData) {
    if (!utilityId) {
        return null; // No podemos inferir sin la Utility base.
    }

    const cleanIncoming = (incomingCommodity || '').trim().toLowerCase();

    // 1. Si la commodity viene CLARA en el Ratesheet, la usamos.
    if (cleanIncoming.includes('electric') || cleanIncoming === 'e') {
        return 'Electric';
    }
    if (cleanIncoming.includes('gas') || cleanIncoming === 'g') {
        return 'Gas';
    }

    // 2. Intentar inferir por la UNIDAD DE MEDIDA si está disponible.
    const cleanUnit = (rateData.unit_type || '').trim().toUpperCase();
    if (cleanUnit === 'KWH') {
        return 'Electric';
    }
    if (cleanUnit === 'CCF' || cleanUnit === 'THERM' || cleanUnit === 'MCF') {
        return 'Gas';
    }

    // 3. Si no es clara, recurrir a la metadata de la Utility.
    try {
        const utilityInfo = await UtilitiesModel.getBasicInfoById(utilityId);

        if (!utilityInfo) {
            return null;
        }

        // Si la Utility solo opera un servicio, asumimos que la tarifa es de ese tipo.
        if (utilityInfo.commodity === 'Electric') {
            return 'Electric';
        }
        if (utilityInfo.commodity === 'Gas') {
            return 'Gas';
        }

        // Si la Utility es 'Both', la inferencia falla y necesitamos que el Ratesheet sea explícito,
        // o que se resuelva manualmente en el frontend (marcando como 'Pending' en el controlador).
        return null;

    } catch (error) {
        console.error("❌ Error fetching utility info for commodity resolution:", error);
        return null;
    }
}

module.exports = {
    resolveCommodity,
};