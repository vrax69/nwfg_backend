const express = require('express');
const router = express.Router();
const multer = require('multer');
const uploadController = require('../controllers/upload.controller');
const authenticateToken = require('../middleware/auth.middleware');

// Configuración de multer en memoria (mejor práctica para microservicios)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

/**
 * POST /upload/rates
 * Protegido por Token y procesado por Multer
 */
router.post('/rates', authenticateToken, upload.single('file'), uploadController.uploadRates);

module.exports = router;