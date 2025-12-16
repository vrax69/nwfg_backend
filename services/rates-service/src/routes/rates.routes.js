// src/routes/rates.routes.js
const express = require('express');
const router = express.Router();
const ratesController = require('../controllers/rates.controller');

// GET /rates
router.get('/', ratesController.getRates);

module.exports = router;
