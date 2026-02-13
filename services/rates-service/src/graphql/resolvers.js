const RatesModel = require('../models/rates.model');
const { GraphQLJSON } = require('graphql-type-json');

const resolvers = {
  JSON: GraphQLJSON,
  Query: {
    getRates: async () => {
      try {
        // El resolver delega al Modelo. No escribe SQL aquí.
        const rates = await RatesModel.findAll();
        // console.log("Resolving rates:", rates?.length);
        return rates;
      } catch (error) {
        console.error("Error en resolver getRates:", error);
        throw new Error("Error fetching rates");
      }
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
