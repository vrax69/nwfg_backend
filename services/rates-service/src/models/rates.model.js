// src/models/rates.model.js
const { masterPool } = require('../config/db');

/**
 * Obtiene rates con filtros opcionales.
 * Si no se pasa ningún filtro, devuelve los primeros 100 registros.
 */
const getRates = async (filters = {}) => {
  const {
    utility_id,
    provider_id,
    state,
    commodity_type,
    customer_type,
    limit = 100,
    offset = 0,
  } = filters;

  let sql = `
    SELECT
      id,
      provider_id,
      utility_id,
      product_name,
      program_code,
      rate,
      msf,
      etf,
      term,
      customer_type,
      commodity_type,
      unit_type,
      ptc,
      savings,
      special_offers,
      notes,
      import_batch_id,
      validation_status,
      created_at,
      updated_at
    FROM rates
    WHERE 1 = 1
  `;

  const params = [];

  if (utility_id) {
    sql += ' AND utility_id = ?';
    params.push(utility_id);
  }

  if (provider_id) {
    sql += ' AND provider_id = ?';
    params.push(provider_id);
  }

  if (state) {
    // filtramos por state a través de utilities
    sql += ' AND utility_id IN (SELECT id FROM utilities WHERE state = ?)';
    params.push(state);
  }

  if (commodity_type) {
    sql += ' AND commodity_type = ?';
    params.push(commodity_type);
  }

  if (customer_type) {
    sql += ' AND customer_type = ?';
    params.push(customer_type);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const [rows] = await masterPool.query(sql, params);
  return rows;
};

module.exports = {
  getRates,
};
