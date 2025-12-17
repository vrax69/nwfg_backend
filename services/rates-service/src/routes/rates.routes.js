// src/routes/rates.routes.js
const express = require('express');
const router = express.Router();
const ratesController = require('../controllers/rates.controller');

// 🔥 IMPORTAR TU MIDDLEWARE DE ROLES
const requireRole = require('../middleware/role.middleware');



// 🔥 NUEVA RUTA CON RESTRICCIÓN DE ROL
// La autenticación (JWT) ya la maneja app.js para todas las rutas.
// Aquí solo restringimos el rol para la operación crítica de inserción.
router.post(
    '/bulk',
    requireRole('Admin', 'QA'), // SOLO Admin y QA pueden cargar masivamente
    ratesController.bulkInsert
);

module.exports = router;