const router = require('express').Router();
const ctrl = require('../controllers/identifiers.controller');

// GET all identifiers
router.get('/', ctrl.getAll);

// GET identifiers for specific utility
router.get('/utility/:utilityId', ctrl.getByUtility);

// POST create new identifier
router.post('/', ctrl.create);

// DELETE identifier
router.delete('/:id', ctrl.delete);

module.exports = router;