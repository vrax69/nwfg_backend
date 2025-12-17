// src/utils/rateNormalizer.js

/**
 * Define el mapeo de headers comunes a las columnas estándar de la tabla rates.
 * Las claves son las columnas de la tabla rates, los valores son los posibles headers del ratesheet.
 */
const HEADER_MAPPING = {
    // ----------------------------------------------------
    // CAMPOS PRINCIPALES DEL RATES CORE
    // ----------------------------------------------------
    product_name: ['ProductName', 'Product Name', 'Program Name', 'Brand Name'],
    program_code: ['Program Code', 'ProgramCode', 'ProductID'],
    rate: ['Rate', 'Rate ($)', 'CleanSky\'s Rate'],
    term: ['Term', 'Term (Months)'],

    // ----------------------------------------------------
    // CARGOS Y CONDICIONES (MSF, ETF, PTC, SAVINGS)
    // ----------------------------------------------------
    msf: ['MSF', 'Monthly Service Fee ($)', 'Service Fee'],
    etf: ['ETF', 'EarlyTerminationFee', 'Cancellation Fee', 'ETF ($)'],
    ptc: ['PTC'],
    savings: ['Savings?'],

    // ----------------------------------------------------
    // CLASIFICACIÓN
    // ----------------------------------------------------
    customer_type: ['CustomerTypes', 'Customer Type', 'Account Type'],
    commodity_type: ['Commodity'],
    unit_type: ['UnitOfMeasure', 'Unit'],

    // ----------------------------------------------------
    // OTROS TEXTOS
    // ----------------------------------------------------
    special_offers: ['SpecialOffers', 'Promo'],
    notes: ['Notes', 'Comments'],

    // ----------------------------------------------------
    // CAMPOS DE ALIAS/UTILITY (Se extraen pero NO van a la tabla rates)
    // ----------------------------------------------------
    // Estos se usan para buscar la utility_id, pero no se insertan en rates directamente
    spl_utility_name: ['Utility', 'Full Utility Name', 'Utility Provider', 'MarketFull Utility Name', 'Abbreviation'],
    state: ['State', 'UtilityState', 'Market'], // 'Market' es un alias común de 'State' en ratesheets
};

/**
 * Normaliza un registro (fila) de ratesheet crudo a la estructura del rates-service.
 * @param {object} rawRateRow - Objeto con los headers del ratesheet (Ej: { "Product Name": "Plan A" })
 * @returns {object} Un objeto con los campos normalizados, spl_utility_name, state y raw_json.
 */
function normalizeRate(rawRateRow) {
    const normalized = {};
    const rawJson = {};
    const remainingRow = { ...rawRateRow }; // Copia mutable

    // 1. Mapeo a columnas estándar
    for (const [standardKey, possibleHeaders] of Object.entries(HEADER_MAPPING)) {
        let value = null;
        let foundOriginalKey = null;

        for (const header of possibleHeaders) {
            // Buscamos la key original en el objeto de entrada
            const originalKey = Object.keys(remainingRow).find(key =>
                key.trim().toLowerCase().replace(/[^a-z0-9]/g, '') === header.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
            );

            if (originalKey !== undefined) {
                value = remainingRow[originalKey];
                foundOriginalKey = originalKey;
                break;
            }
        }

        if (value !== null && value !== undefined && String(value).trim() !== '') {
            // Los campos de alias/estado no van a la tabla `rates`, sino que son usados por los Resolvers.
            if (standardKey !== 'spl_utility_name' && standardKey !== 'state') {
                normalized[standardKey] = value;
            } else {
                normalized[standardKey] = value;
            }

            // Eliminar el campo mapeado de la copia para que no vaya a raw_json
            delete remainingRow[foundOriginalKey];
        }
    }

    // 2. Todo lo que quedó en remainingRow va a raw_json
    for (const [key, value] of Object.entries(remainingRow)) {
        if (value !== null && value !== undefined && String(value).trim() !== '') {
            rawJson[key] = value;
        }
    }

    // 3. Crear el objeto final
    return {
        // Datos para la tabla rates
        ...normalized,
        raw_json: JSON.stringify(rawJson),

        // Datos de utilidad (temporales para el Controller/Resolvers)
        spl_utility_name: normalized.spl_utility_name,
        state: normalized.state
    };
}

module.exports = {
    normalizeRate
};