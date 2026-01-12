// src/middleware/gatewayAuth.js
// Middleware para leer los headers que inyecta el Gateway en las peticiones GraphQL

module.exports = (req, res, next) => {
  // El Gateway inyecta los datos del usuario mediante headers x-user-*
  // Si estos headers están presentes, significa que el Gateway ya validó el JWT
  req.user = {
    id: req.headers['x-user-id'],
    role: req.headers['x-user-role'] || req.headers['x-user-rol'], // Por si acaso hay variación
    email: req.headers['x-user-email'],
    nombre: req.headers['x-user-nombre'],
    centro: req.headers['x-user-centro-id'],
  };

  next();
};

