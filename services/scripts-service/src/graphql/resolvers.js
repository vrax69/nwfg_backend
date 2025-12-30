const ScriptsModel = require('../models/scripts.model');
const SectionsModel = require('../models/sections.model');
const { masterPool } = require('../config/db');

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
      const updatedSection = await SectionsModel.saveOrUpdateSection(args);
      return updatedSection;
    },

    reorderSections: async (_, { script_id, section_ids }) => {
      // Actualizar el orden de las secciones
      for (let i = 0; i < section_ids.length; i++) {
        await masterPool.query(
          'UPDATE script_sections SET section_order = ? WHERE section_id = ? AND script_id = ?',
          [i + 1, section_ids[i], script_id]
        );
      }
      return true;
    }
  }
};

module.exports = resolvers;