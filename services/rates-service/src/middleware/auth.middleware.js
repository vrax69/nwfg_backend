// src/middleware/auth.middleware.js

const jwt = require('jsonwebtoken');

module.exports = function auth(required = true) {
  return (req, res, next) => {
    try {
      const header = req.headers['authorization'];

      if (!header) {
        if (required) {
          return res.status(401).json({ success: false, message: 'Missing Authorization header' });
        } else {
          req.user = null;
          return next();
        }
      }

      const parts = header.split(' ');

      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return res.status(401).json({ success: false, message: 'Invalid Authorization format' });
      }

      const token = parts[1];

      // Verify JWT
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Attach user info to request
      req.user = {
        id: decoded.id,
        email: decoded.email,
        rol: decoded.rol,
        nombre: decoded.nombre
      };

      next();
    } catch (error) {
      console.error('❌ Auth Middleware Error:', error.message);
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
  };
};
