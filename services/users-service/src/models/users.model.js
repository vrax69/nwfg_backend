import { db } from '../config/db.js';

const UsersModel = {
    findById: async (id) => {
        const [[user]] = await db.query(
            `SELECT id, nombre, username, email, rol, status, centro, avatar
             FROM usuarios WHERE id = ?`,
            [id]
        );
        return user || null;
    },

    findByUsername: async (username) => {
        const [rows] = await db.query(
            `SELECT id, nombre, username, email, rol, centro, password, status, avatar
             FROM usuarios WHERE username = ? LIMIT 1`,
            [username]
        );
        return rows[0] || null;
    },

    verifyPassword: (inputPassword, storedPassword) => {
        return inputPassword === storedPassword;
    },
};

export default UsersModel;
