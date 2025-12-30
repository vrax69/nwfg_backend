const ScriptsModel = require('../models/scripts.model');

const resolvers = {
  Query: {
    getTeleprompter: async (_, { provider_id, state, commodity }) => {
      try {
        const sections = await ScriptsModel.getFilteredSections(provider_id, state, commodity);
        return sections;
      } catch (error) {
        throw new Error('Error al obtener el teleprompter: ' + error.message);
      }
    },
    
    getFullScript: async (_, { script_id }) => {
      return await ScriptsModel.getFullScript(script_id);
    },

    listScriptsByProvider: async (_, { provider_id }) => {
      const [rows] = await masterPool.query(
        'SELECT * FROM scripts WHERE provider_id = ?', 
        [provider_id]
      );
      return rows;
    }
  },

  Mutation: {
    saveSection: async (_, args) => {
      // Aquí implementarías la lógica de INSERT o UPDATE en script_sections
      // Y luego dispararías la Subscription para el tiempo real
      const updatedSection = await ScriptsModel.saveOrUpdateSection(args); // Método a crear en el model
      
      // Notificar a los agentes en tiempo real vía PubSub
      // pubsub.publish(`SCRIPT_UPDATED_${args.script_id}`, { scriptUpdated: ... });
      
      return updatedSection;
    }
  }
};

module.exports = resolvers;