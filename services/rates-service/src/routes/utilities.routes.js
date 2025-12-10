// src/routes/utilities.routes.js

const express = require('express');
const UtilitiesController = require('../controllers/utilities.controller');

const router = express.Router();

// GET - todas las utilities
router.get('/', UtilitiesController.getAll);

// GET - utility por ID
router.get('/:id', UtilitiesController.getById);

// POST - crear utility
router.post('/', UtilitiesController.create);

// GET - aliases de una utility
router.get('/:id/aliases', UtilitiesController.getAliases);

// GET - identifiers de una utility
router.get('/:id/identifiers', UtilitiesController.getIdentifiers);

module.exports = router;
