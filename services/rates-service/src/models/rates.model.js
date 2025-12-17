// src/models/rates.model.js
const { masterPool } = require('../config/db');
// ... función getRates (ya existe) ...

/**
 * Inserta múltiples registros en la tabla 'rates' en una sola consulta.
 * @param {Array<object>} ratesArray - Arreglo de objetos de tarifas ya normalizadas.
 * @returns {number} El ID del primer registro insertado.
 */
const bulkInsert = async (ratesArray) => {
  if (!ratesArray || ratesArray.length === 0) {
    return 0;
  }

  const columns = [
    'provider_id',
    'utility_id',
    'product_name',
    'program_code',
    'rate',
    'msf',
    'etf',
    'term',
    'customer_type',
    'commodity_type',
    'unit_type',
    'ptc',
    'savings',
    'special_offers',
    'notes',
    'raw_json',
    'import_batch_id',
    'validation_status',
    'created_at',
    'updated_at'
  ];

  // Crear la lista de arrays de valores (Valores preparados para la consulta)
  const values = ratesArray.map(rate => [
    rate.provider_id,
    rate.utility_id,
    rate.product_name,
    rate.program_code,
    rate.rate,
    rate.msf,
    rate.etf,
    rate.term,
    rate.customer_type,
    rate.commodity_type,
    rate.unit_type,
    rate.ptc,
    rate.savings,
    rate.special_offers,
    rate.notes,
    rate.raw_json,
    rate.import_batch_id,
    rate.validation_status,
    new Date(), // created_at
    new Date()  // updated_at
  ]);

  const sql = `
        INSERT INTO rates (${columns.join(', ')}) 
        VALUES ?
    `;

  // Usamos pool.query con el placeholder '?' para inserción múltiple
  const [result] = await masterPool.query(sql, [values]);

  return result.insertId;
};

module.exports = {
  bulkInsert // 🔥 Exportar la nueva función
};