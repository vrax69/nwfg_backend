// src/models/utilities.model.js

const { masterPool } = require('../config/db');

const UtilitiesModel = {

  // ================================
  // GET ALL UTILITIES
  // ================================
  async getAll() {
    const [rows] = await masterPool.query(`
      SELECT 
        id,
        standard_name,
        state,
        commodity,
        default_unit,
        phone,
        website,
        logo_url,
        active,
        created_at,
        updated_at
      FROM utilities
      ORDER BY standard_name ASC
    `);
    return rows;
  },

  // ================================
  // GET UTILITY BY ID
  // ================================
  async getById(id) {
    const [rows] = await masterPool.query(
      `
      SELECT 
        id,
        standard_name,
        state,
        commodity,
        default_unit,
        phone,
        website,
        logo_url,
        active,
        created_at,
        updated_at
      FROM utilities
      WHERE id = ?
      `,
      [id]
    );
    return rows[0] || null;
  },

  // ================================
  // CREATE UTILITY
  // ================================
  async create(data) {
    const {
      standard_name,
      state,
      commodity,
      default_unit,
      phone,
      website,
      logo_url,
      active
    } = data;

    const [result] = await masterPool.query(
      `
      INSERT INTO utilities (
        standard_name,
        state,
        commodity,
        default_unit,
        phone,
        website,
        logo_url,
        active,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        standard_name,
        state,
        commodity,
        default_unit,
        phone,
        website,
        logo_url,
        active ?? 1
      ]
    );

    return result.insertId;
  },

  // ================================
  // GET ALIASES OF A UTILITY
  // ================================
  async getAliases(utility_id) {
    const [rows] = await masterPool.query(
      `
      SELECT 
        id,
        alias,
        utility_id,
        status,
        notes,
        created_at
      FROM utility_aliases
      WHERE utility_id = ?
      ORDER BY alias ASC
      `,
      [utility_id]
    );
    return rows;
  },

  // ================================
  // GET IDENTIFIERS OF A UTILITY
  // ================================
  async getIdentifiers(utility_id) {
    const [rows] = await masterPool.query(
      `
      SELECT 
        id,
        service_type,
        identifier_label,
        identifier_format,
        unit_of_measure,
        notes,
        created_at
      FROM utility_identifiers
      WHERE utility_id = ?
      ORDER BY service_type ASC
      `,
      [utility_id]
    );
    return rows;
  },

  // ================================================
  // GET BASIC INFO (for resolvers)
  // ================================================
  async getBasicInfoById(id) {
    const [rows] = await masterPool.query(
      `
      SELECT 
        commodity,
        default_unit
      FROM utilities
      WHERE id = ?
      `,
      [id]
    );
    return rows[0] || null;
  }
};

module.exports = UtilitiesModel;
