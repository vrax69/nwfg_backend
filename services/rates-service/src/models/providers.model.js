// src/models/providers.model.js

const { userPool } = require('../config/db'); // Usamos el pool correcto: userPool

const ProvidersModel = {

    // ================================
    // GET ALL PROVIDERS
    // ================================
    async getAll() {
        // Consultamos la tabla 'proveedores' en el esquema user_data_tpv_staging
        const [rows] = await userPool.query(`
            SELECT 
                id, 
                nombre, 
                codigo 
            FROM proveedores
            ORDER BY nombre ASC
        `);
        return rows;
    },

    // ================================
    // GET PROVIDER BY ID
    // ================================
    async getById(id) {
        const [rows] = await userPool.query(
            `
            SELECT 
                id, 
                nombre, 
                codigo 
            FROM proveedores
            WHERE id = ?
            `,
            [id]
        );
        return rows[0] || null;
    }
};

module.exports = ProvidersModel;