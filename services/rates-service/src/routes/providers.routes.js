// src/routes/providers.routes.js

const express = require('express');
const ProvidersController = require('../controllers/providers.controller');

const router = express.Router();

// GET - todos los providers
router.get('/', ProvidersController.getAll);

// GET - provider por ID
router.get('/:id', ProvidersController.getById);

module.exports = router;