// src/models/providers.model.js

const pool = require('../config/db');

const ProvidersModel = {

    // ================================
    // GET ALL PROVIDERS
    // ================================
    async getAll() {
        const [rows] = await pool.query(`
            SELECT id, nombre, logo_url, spl_slug
            FROM providers
            WHERE status = 'active'
            ORDER BY nombre ASC
        `);
        return rows;
    },

    // ================================
    // GET PROVIDER BY ID
    // ================================
    async getById(id) {
        const [rows] = await pool.query(
            `SELECT id, nombre FROM providers WHERE id = ?`,
            [id]
        );
        return rows[0] || null;
    }
};

module.exports = ProvidersModel;