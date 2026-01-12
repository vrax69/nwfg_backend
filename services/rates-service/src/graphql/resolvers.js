const RatesModel = require('../models/rates.model');
const ProvidersModel = require('../models/providers.model');
const UtilitiesModel = require('../models/utilities.model');
const { masterPool } = require('../config/db');

const resolvers = {
  Query: {
    getRates: async (_, { state, commodity, provider_id }, context) => {
      try {
        // Capturamos la identidad del usuario (para logging o usos futuros)
        // Pero NO filtramos la DB por centro porque la tabla rates no lo tiene.
        const centroId = context.req?.headers?.['x-user-centro-id'];
        const userId = context.req?.headers?.['x-user-id'];

        // Usamos la vista 'agent_rates_view' que tiene la info unificada
        let query = `SELECT * FROM agent_rates_view WHERE 1=1`;
        const params = [];

        if (state) {
          query += ' AND state = ?';
          params.push(state);
        }

        if (commodity) {
          // Algunos sistemas usan commodity_type, otros utility_commodity en la vista
          query += ' AND (commodity_type = ? OR utility_commodity = ?)';
          params.push(commodity, commodity);
        }

        if (provider_id) {
          query += ' AND provider_id = ?';
          params.push(provider_id);
        }

        // Ordenamiento por novedad
        query += ' ORDER BY created_at DESC';

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
            r.id as rate_id,
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
          WHERE r.id = ? AND r.validation_status = 'Validated'`,
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

