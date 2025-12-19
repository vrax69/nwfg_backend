const axios = require('axios');

/**
 * Valida el token JWT delegando la verificación al users-service
 */
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'No authorization token provided' });
    }

    try {
        // Red interna de Docker: el upload-service le pregunta al users-service
        const USERS_URL = process.env.USERS_SERVICE_URL || 'http://users-service:4001';

        // Asumimos que tu users-service tiene una ruta GET /api/auth/verify que devuelve el usuario del token
        const response = await axios.get(`${USERS_URL}/api/auth/verify`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        // Inyectamos los datos del usuario (id, role, etc) en el objeto request
        req.user = response.data.user;
        next();
    } catch (error) {
        console.error('❌ Auth Verification Error:', error.message);
        return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
};

module.exports = authenticateToken;