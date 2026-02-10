// Importamos el Modelo (Clean Architecture)
const RatesModel = require('../models/rates.model'); // Asegúrate que la ruta relativa sea correcta

const resolvers = {
  Query: {
    getRates: async () => {
      try {
        // El resolver delega al Modelo. No escribe SQL aquí.
        const rates = await RatesModel.findAll();
        console.log("Resolving rates:", rates?.length);
        return rates;
      } catch (error) {
        console.error("Error en resolver getRates:", error);
        throw new Error("Error fetching rates");
      }
    }
  }
};

module.exports = resolvers;
