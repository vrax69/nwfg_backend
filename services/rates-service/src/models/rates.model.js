const { masterPool } = require('../config/db');

/**
 * Inserta tarifas manejando versiones. Inactiva lo viejo, inserta lo nuevo.
 */
const bulkInsert = async (ratesArray) => {
  if (!ratesArray || ratesArray.length === 0) return 0;

  const connection = await masterPool.getConnection();
  try {
    await connection.beginTransaction();

    // 🔥 MEJOR PRÁCTICA: "Kill the old, long live the new"
    // Marcamos como 'Rejected' todas las tarifas anteriores del mismo proveedor
    const providerId = ratesArray[0].provider_id;
    await connection.query(
      "UPDATE rates SET validation_status = 'Rejected' WHERE provider_id = ? AND validation_status = 'Validated'",
      [providerId]
    );

    const columns = [
      'provider_id', 'utility_id', 'product_name', 'rate', 'msf', 'etf',
      'term', 'customer_type', 'commodity_type', 'unit_type',
      'raw_json', 'import_batch_id', 'validation_status', 'created_at', 'updated_at'
    ];

    const values = ratesArray.map(rate => [
      rate.provider_id,
      rate.utility_id,
      rate.product_name,
      rate.rate,
      rate.msf || 0,
      rate.etf || null,
      rate.term,
      rate.customer_type,
      rate.commodity_type,
      rate.unit_type,
      typeof rate.raw_json === 'object' ? JSON.stringify(rate.raw_json) : rate.raw_json,
      rate.import_batch_id,
      rate.validation_status,
      new Date(),
      new Date()
    ]);

    const sql = `INSERT INTO rates (${columns.join(', ')}) VALUES ?`;
    const [result] = await connection.query(sql, [values]);

    await connection.commit();
    return result.affectedRows;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const getRates = async () => {
  const [rows] = await masterPool.query('SELECT * FROM rates WHERE validation_status = "Validated" ORDER BY created_at DESC');
  return rows;
};

module.exports = { bulkInsert, getRates };