const RatesModel     = require('../models/rates.model');
const UtilityModel   = require('../models/utilities.model');
const ProvidersModel = require('../models/providers.model');
const { GraphQLJSON } = require('graphql-type-json');
const pubsub = require('../config/pubsub');

const resolvers = {
  JSON: GraphQLJSON,
  Mutation: {
    createAlias: async (_, { dirtyName, utilityId }) => {
      try {
        await UtilityModel.createAlias(dirtyName.trim(), utilityId);
        return { success: true, message: `Alias "${dirtyName}" creado correctamente` };
      } catch (err) {
        console.error('[createAlias] error:', err.message);
        return { success: false, message: err.message };
      }
    },

    createUtility: async (_, { nombre, market, slug }) => {
      try {
        const utility = await UtilityModel.create({ nombre, market, slug });
        return { success: true, utility, message: `Utilidad "${nombre}" creada` };
      } catch (err) {
        console.error('[createUtility] error:', err.message);
        return { success: false, utility: null, message: err.message };
      }
    },
  },
  Subscription: {
    ratesUpdated: {
      subscribe: () => pubsub.asyncIterator(['RATE_UPDATED'])
    }
  },
  Query: {
    // Query principal con filtros
    getRates: async (_, { provider_id, state, utilityId }, context) => {
      const userRole = context.req.headers['x-user-role'];
      const includeDrafts = userRole === 'ADMIN' || userRole === 'QA';
      return await RatesModel.findAll({ provider_id, state, utilityId, includeDrafts });
    },

    getUtilities: async () => {
      return await UtilityModel.findAll();
    },

    getProviders: async () => {
      return await ProvidersModel.getAll();
    },

    // Nueva Query: Estructura del Mercado (Grid)
    getMarketStructure: async (_, __, context) => {
      const userRole = context.req.headers['x-user-role'];
      const includeDrafts = userRole === 'ADMIN' || userRole === 'QA';
      const rows = await RatesModel.findMarketStructure(includeDrafts);

      // Transformar filas planas (state_code, utility_name, rate_count)
      // a estructura jerárquica [State] -> [Utility]
      const statesMap = {};

      rows.forEach(row => {
        if (!statesMap[row.state_code]) {
          statesMap[row.state_code] = {
            code: row.state_code,
            utilitiesMap: {} // Map temporal para agrupar utilidades
          };
        }

        const stateEntry = statesMap[row.state_code];
        const utilKey = row.utility_name;

        if (!stateEntry.utilitiesMap[utilKey]) {
          stateEntry.utilitiesMap[utilKey] = {
            id: utilKey, // Usamos nombre como ID temporal
            name: utilKey,
            serviceType: row.commodity, // Puede sobreescribirse si hay varios
            rateCount: 0
          };
        }

        stateEntry.utilitiesMap[utilKey].rateCount += row.rate_count;
      });

      // Convertir Map a Array ordenado
      return Object.values(statesMap).map(state => ({
        code: state.code,
        utilities: Object.values(state.utilitiesMap)
      }));
    },

    getRate: async (_, { id }) => {
      return await RatesModel.getById(id);
    }
  },

  Rate: {
    provider: (rate) => {
      // Si tenemos datos del proveedor en el join (RateModel.findAll hace join?), devolvemos algo
      // Si no, devolvemos solo el ID para que el Gateway pregunte al users-service (si allá está la data maestra)
      // Pero ADR 002 dice "Shareable", ambos tienen datos.
      // RatesModel.findAll ya hace un join con providers? NO, hace join con Utility_Mapping.
      // Necesitamos el provider_id.
      // Asumiendo que rate tiene provider_id (tabla rates nueva tiene provider_id)

      return { __typename: "Provider", id: rate.provider_id };
    }
  },

  Provider: {
    __resolveReference: (provider) => {
      return { __typename: "Provider", id: provider.id };
    }
  }
};

module.exports = resolvers;
