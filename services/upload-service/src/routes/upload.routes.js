const express = require('express');
const router = express.Router();
const multer = require('multer');
const UploadController = require('../controllers/upload.controller');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.single('file'), UploadController.uploadFile);
router.post('/confirm', UploadController.confirmUpload);

module.exports = router;