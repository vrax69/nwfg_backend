// src/controllers/rates.controller.js
const RatesModel = require('../models/rates.model');

/**
 * GET /rates
 * Filtros opcionales por querystring:
 * - utility_id
 * - provider_id
 * - state
 * - commodity_type
 * - customer_type
 * - limit
 * - offset
 */
const getRates = async (req, res) => {
  try {
    const {
      utility_id,
      provider_id,
      state,
      commodity_type,
      customer_type,
      limit,
      offset,
    } = req.query;

    const filters = {
      utility_id,
      provider_id,
      state,
      commodity_type,
      customer_type,
      limit,
      offset,
    };

    const rates = await RatesModel.getRates(filters);

    res.json({
      success: true,
      count: rates.length,
      data: rates,
    });
  } catch (error) {
    console.error('❌ Error retrieving rates:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error retrieving rates',
    });
  }
};

module.exports = {
  getRates,
};
