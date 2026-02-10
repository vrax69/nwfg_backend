const express = require('express');
const router = express.Router();
const ratesController = require('../controllers/rates.controller');

// Definir la ruta GET /api/rates/
router.get('/', ratesController.getRates);

module.exports = router;