const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
    // console.log('--- DEBUG: REQUEST HEADERS ---');
    // console.log(JSON.stringify(req.headers, null, 2));

    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: "Missing Authorization header" });
    }

    const secret = process.env.JWT_SECRET || 'NwfgMasterSecret2025!!'; // Fallback for dev

    jwt.verify(token, secret, (err, user) => {
        if (err) {
            console.error('❌ JWT Verification failed:', err.message);
            return res.status(403).json({ success: false, message: 'Invalid or expired token' });
        }
        // console.log('✅ Token Verified. User:', user.id);
        req.user = user;
        next();
    });
};

module.exports = authenticateToken;