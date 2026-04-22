const ExcelService = require('../services/excel.service');
const redis = require('../config/redis');
const { v4: uuidv4 } = require('uuid');
const { auditQueue } = require('../queues/etl.queues');
const { emitUploadEvent } = require('../events/emit');

class UploadController {

    // POST /api/upload
    // Stores file in Redis, kicks off async audit, returns headers for FE mapping UI.
    // Confirmation is handled via the Gateway `confirmUpload` mutation → ETL_EVENTS.
    static async uploadFile(req, res) {
        console.log(`📥 [upload] POST /api/upload — file: ${req.file?.originalname ?? 'MISSING'} user: ${req.headers['x-user-id']}`);
        try {
            if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

            const userId = req.headers['x-user-id'] || 'unknown';
            const sessionId = uuidv4();
            const fileBase64 = req.file.buffer.toString('base64');

            await redis.set(`upload:${sessionId}:file`, fileBase64, 'EX', 7200);
            await redis.set(`upload:${sessionId}:owner`, userId, 'EX', 7200);

            await auditQueue.add('audit', {
                sessionId,
                userId,
                filename: req.file.originalname,
                fileBase64,
                fileSize: req.file.size,
            });

            const parsedData = ExcelService.parseBuffer(req.file.buffer);

            await emitUploadEvent({ type: 'UPLOAD_STARTED', sessionId, userId, filename: req.file.originalname, scope: 'global' });
            await emitUploadEvent({ type: 'PARSE_COMPLETE', sessionId, userId, scope: 'global', sheets: parsedData.sheets, rowCount: parsedData.results.length });

            return res.json({
                success: true,
                sessionId,
                headers: parsedData.headers,
                rowCount: parsedData.results.length,
            });

        } catch (error) {
            console.error('❌ [upload] uploadFile error:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = UploadController;
