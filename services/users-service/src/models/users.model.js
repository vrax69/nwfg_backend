import { db } from '../config/db.js';

const UsersModel = {
    findById: async (id) => {
        try {
            const [[user]] = await db.query(
                `SELECT id, nombre, username, email, rol, rol as role, status, centro
         FROM user_data_tpv_staging.usuarios
         WHERE id = ?`,
                [id]
            );
            return user;
        } catch (error) {
            throw new Error('Error finding user by ID: ' + error.message);
        }
    },

    // Login por username (campo dedicado, formato nombre.apellido)
    // Email es solo informativo — el staff lo asigna pero no se usa para auth
    findByUsername: async (username) => {
        try {
            const [rows] = await db.query(
                `SELECT id, nombre, username, email, rol, centro, password, status
         FROM user_data_tpv_staging.usuarios
         WHERE username = ? LIMIT 1`,
                [username]
            );
            return rows[0];
        } catch (error) {
            throw new Error('Error finding user by username: ' + error.message);
        }
    },

    verifyPassword: (inputPassword, storedPassword) => {
        // SECURITY WARNING: Plain text comparison as requested.
        return inputPassword === storedPassword;
    }
};

export default UsersModel;
