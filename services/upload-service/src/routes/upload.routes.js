const express = require('express');
const router = express.Router();
const multer = require('multer');
const UploadController = require('../controllers/upload.controller');

const upload = multer({ storage: multer.memoryStorage() });

// File upload (multipart) — must stay REST; FE confirms via Gateway mutation confirmUpload
router.post('/', upload.single('file'), UploadController.uploadFile);

module.exports = router;
