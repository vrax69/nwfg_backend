const RatesModel = require('../models/rates.model');
const ProvidersModel = require('../models/providers.model');
const UtilitiesModel = require('../models/utilities.model');
const { masterPool } = require('../config/db');

const resolvers = {
  Query: {
    getRates: async (_, { state, commodity, provider_id }) => {
      try {
        let query = `
          SELECT 
            r.rate_id,
            r.provider_id,
            r.utility_id,
            r.product_name,
            r.rate,
            r.msf,
            r.etf,
            r.term,
            r.customer_type,
            r.commodity_type,
            r.unit_type,
            r.validation_status,
            r.import_batch_id,
            r.created_at,
            r.updated_at,
            p.nombre as provider_name,
            u.standard_name as utility_name,
            u.state
          FROM rates r
          LEFT JOIN user_data_tpv_staging.proveedores p ON r.provider_id = p.id
          LEFT JOIN utilities u ON r.utility_id = u.id
          WHERE r.validation_status = 'Validated'
        `;
        
        const params = [];
        
        if (state) {
          query += ' AND u.state = ?';
          params.push(state);
        }
        
        if (commodity) {
          query += ' AND r.commodity_type = ?';
          params.push(commodity);
        }
        
        if (provider_id) {
          query += ' AND r.provider_id = ?';
          params.push(provider_id);
        }
        
        query += ' ORDER BY r.created_at DESC';
        
        const [rows] = await masterPool.query(query, params);
        return rows;
      } catch (error) {
        console.error('Error en getRates:', error);
        throw new Error('Error al obtener las tarifas: ' + error.message);
      }
    },

    getRateById: async (_, { id }) => {
      try {
        const [rows] = await masterPool.query(
          `SELECT 
            r.rate_id,
            r.provider_id,
            r.utility_id,
            r.product_name,
            r.rate,
            r.msf,
            r.etf,
            r.term,
            r.customer_type,
            r.commodity_type,
            r.unit_type,
            r.validation_status,
            r.import_batch_id,
            r.created_at,
            r.updated_at,
            p.nombre as provider_name,
            u.standard_name as utility_name,
            u.state
          FROM rates r
          LEFT JOIN user_data_tpv_staging.proveedores p ON r.provider_id = p.id
          LEFT JOIN utilities u ON r.utility_id = u.id
          WHERE r.rate_id = ? AND r.validation_status = 'Validated'`,
          [id]
        );
        return rows[0] || null;
      } catch (error) {
        console.error('Error en getRateById:', error);
        throw new Error('Error al obtener la tarifa: ' + error.message);
      }
    },

    getProviders: async () => {
      try {
        return await ProvidersModel.getAll();
      } catch (error) {
        console.error('Error en getProviders:', error);
        throw new Error('Error al obtener los proveedores: ' + error.message);
      }
    },

    getProviderById: async (_, { id }) => {
      try {
        return await ProvidersModel.getById(id);
      } catch (error) {
        console.error('Error en getProviderById:', error);
        throw new Error('Error al obtener el proveedor: ' + error.message);
      }
    },

    getUtilities: async () => {
      try {
        return await UtilitiesModel.getAll();
      } catch (error) {
        console.error('Error en getUtilities:', error);
        throw new Error('Error al obtener las utilidades: ' + error.message);
      }
    },

    getUtilityById: async (_, { id }) => {
      try {
        return await UtilitiesModel.getById(id);
      } catch (error) {
        console.error('Error en getUtilityById:', error);
        throw new Error('Error al obtener la utilidad: ' + error.message);
      }
    }
  }
};

module.exports = resolvers;

