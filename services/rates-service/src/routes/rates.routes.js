// src/routes/rates.routes.js
const express = require('express');
const router = express.Router();
const ratesController = require('../controllers/rates.controller');
const requireRole = require('../middleware/role.middleware');

// 🔥 Agregamos 'Administrador' para que coincida con tu base de datos
router.post(
    '/bulk',
    requireRole('Admin', 'QA', 'Administrador'),
    ratesController.bulkInsert
);

router.post('/confirm-mapping', requireRole('Administrador', 'Admin'), ratesController.confirmMapping);


module.exports = router;