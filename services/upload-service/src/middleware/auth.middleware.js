const axios = require('axios');

const authenticateToken = async (req, res, next) => {
    // 1. Buscamos el header en cualquier formato (case-insensitive)
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];

    if (!authHeader) {
        return res.status(401).json({ success: false, message: "Missing Authorization header" });
    }

    // 2. Extraemos el token limpiamente
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;

    try {
        const USERS_URL = process.env.USERS_SERVICE_URL || 'http://users-service:4001';

        // 3. Validamos contra el users-service
        const response = await axios.get(`${USERS_URL}/api/auth/verify`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        req.user = response.data.user;
        next();
    } catch (error) {
        console.error('❌ Auth Error en Upload Service:', error.message);
        return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
};

module.exports = authenticateToken;