/**
 * Normalizador con Mapeo Dinámico, Contextual y Limpieza de Moneda.
 */
const normalizeRate = (raw, mapping = {}) => {
    // 1. Identificar columnas según el mapeo o nombres Spark/NGE por defecto
    const rateCol = mapping.rate || 'Rate';
    const utilityCol = mapping.spl_utility_name || 'Full Utility Name';
    const productCol = mapping.product_name || 'ProductName';
    const termCol = mapping.term || 'Term';
    const etfCol = mapping.etf || 'EarlyTerminationFee';
    const msfCol = mapping.msf || 'MSF';

    // 2. Limpieza matemática: Precios (0,1525 -> 0.1525)
    let rawRateStr = String(raw[rateCol] || '0').replace(',', '.').trim();
    let parsedRate = parseFloat(rawRateStr) || 0;

    // 3. Limpieza de Cargos (MSF/ETF): Quitar "$" y texto extra
    const cleanCurrency = (val) => String(val || '0').replace(/[$\s,a-zA-Z]/g, '').trim();
    let msfValue = parseFloat(cleanCurrency(raw[msfCol])) || 0;

    // El ETF lo guardamos como texto para el usuario, pero lo capturamos limpio si es posible
    let etfValue = String(raw[etfCol] || '0').trim();

    // 4. Lógica contextual de Precios (Luz vs Gas)
    const commodity = (raw.commodity_type || raw.Commodity || 'Electric').toLowerCase();
    if (commodity.includes('elec') && parsedRate > 2.0) {
        parsedRate = parsedRate / 100;
    } else if (commodity.includes('gas') && parsedRate > 50.0) {
        parsedRate = parsedRate / 100;
    }

    return {
        spl_utility_name: (raw[utilityCol] || '').trim(),
        product_name: (raw[productCol] || 'Standard Plan').trim(),
        rate: parseFloat(parsedRate.toFixed(6)),
        msf: msfValue,
        etf: etfValue,
        term: parseInt(raw[termCol]) || 0,
        customer_type: (raw.CustomerTypes || raw.customer_type || 'Residential').trim(),
        commodity_type: commodity.includes('gas') ? 'Gas' : 'Electric',
        unit_type: (raw.UnitOfMeasure || raw.unit_type || (commodity.includes('gas') ? 'THERM' : 'KWH')).toUpperCase(),
        raw_json: raw
    };
};

module.exports = { normalizeRate };