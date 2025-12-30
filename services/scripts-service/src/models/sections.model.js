// src/models/sections.model.js
const { masterPool } = require('../config/db');

const saveOrUpdateSection = async (data) => {
    const { section_id, script_id, section_name, section_text, target_state, target_commodity, section_order, conditions } = data;
    
    // Si section_id existe, es UPDATE; si no, es INSERT
    if (section_id) {
      const sql = `UPDATE script_sections SET 
        section_name = ?, section_text = ?, target_state = ?, 
        target_commodity = ?, section_order = ?, conditions = ?
        WHERE section_id = ?`;
      await masterPool.query(sql, [section_name, section_text, target_state, target_commodity, section_order, JSON.stringify(conditions || {}), section_id]);
      return { ...data, section_id };
    } else {
      const sql = `INSERT INTO script_sections 
        (script_id, section_name, section_text, target_state, target_commodity, section_order, conditions) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`;
      const [result] = await masterPool.query(sql, [script_id, section_name, section_text, target_state, target_commodity, section_order, JSON.stringify(conditions || {})]);
      return { ...data, section_id: result.insertId };
    }
  };

module.exports = { saveOrUpdateSection };