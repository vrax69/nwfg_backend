const { masterPool } = require('../config/db');

const ScriptsModel = {
  // Query inteligente para el Teleprompter (Agente)
  getFilteredSections: async (provider_id, state, commodity) => {
    const sql = `
      SELECT ss.* FROM script_sections ss
      JOIN scripts s ON ss.script_id = s.script_id
      WHERE s.provider_id = ? 
        AND s.is_active = 1
        AND (ss.target_state IS NULL OR FIND_IN_SET(?, ss.target_state))
        AND (ss.target_commodity IS NULL OR ss.target_commodity = ? OR ss.target_commodity = 'Both')
      ORDER BY ss.section_order ASC
    `;
    // FIND_IN_SET permite que target_state sea "PA,MA,OH" y detecte "OH" correctamente
    const [rows] = await masterPool.query(sql, [provider_id, state, commodity]);
    return rows;
  },

  // Obtener script completo para el Editor (QA)
  getFullScript: async (script_id) => {
    const [script] = await masterPool.query('SELECT * FROM scripts WHERE script_id = ?', [script_id]);
    const [sections] = await masterPool.query(
      'SELECT * FROM script_sections WHERE script_id = ? ORDER BY section_order ASC', 
      [script_id]
    );
    return { ...script[0], sections };
  }
};

module.exports = ScriptsModel;