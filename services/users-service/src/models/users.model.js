import { db } from '../config/db.js';

const UsersModel = {
    findById: async (id) => {
        try {
            const [[user]] = await db.query(
                `SELECT id, nombre, email, rol, rol as role, status, centro
         FROM user_data_tpv_staging.usuarios
         WHERE id = ?`,
                [id]
            );
            return user;
        } catch (error) {
            throw new Error('Error finding user by ID: ' + error.message);
        }
    },

    findByEmail: async (email) => {
        try {
            const [rows] = await db.query(
                `SELECT id, nombre, email, rol, centro, password, status
         FROM user_data_tpv_staging.usuarios
         WHERE email = ? LIMIT 1`,
                [email]
            );
            return rows[0];
        } catch (error) {
            throw new Error('Error finding user by email: ' + error.message);
        }
    },

    verifyPassword: (inputPassword, storedPassword) => {
        // SECURITY WARNING: Plain text comparison as requested.
        return inputPassword === storedPassword;
    }
};

export default UsersModel;
