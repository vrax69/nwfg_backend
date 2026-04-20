const ExcelService = require('../services/excel.service');
const redis = require('../config/redis');
const { v4: uuidv4 } = require('uuid');
const { auditQueue, processQueue } = require('../queues/etl.queues');
const { emitUploadEvent } = require('../events/emit');

class UploadController {

    // POST /api/upload
    // Receives file, parses headers synchronously (FE needs them for mapping UI),
    // then delegates MinIO backup + audit log to the async etl:audit queue.
    static async uploadFile(req, res) {
        console.log(`📥 [upload] POST /api/upload — file: ${req.file?.originalname ?? 'MISSING'} user: ${req.headers['x-user-id']}`);
        try {
            if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

            const userId = req.headers['x-user-id'] || 'unknown';
            const sessionId = uuidv4();
            const fileBase64 = req.file.buffer.toString('base64');

            // Store file + owner in Redis (sync — process.worker needs these)
            await redis.set(`upload:${sessionId}:file`, fileBase64, 'EX', 7200);
            await redis.set(`upload:${sessionId}:owner`, userId, 'EX', 7200);

            // Enqueue audit job (MinIO backup + DB log) — non-blocking
            await auditQueue.add('audit', {
                sessionId,
                userId,
                filename: req.file.originalname,
                fileBase64,
                fileSize: req.file.size,
            });

            // Parse headers synchronously — FE needs them to render the mapping UI
            const parsedData = ExcelService.parseBuffer(req.file.buffer);

            console.log(`📡 [upload] emitting UPLOAD_STARTED session=${sessionId}`);
            await emitUploadEvent({
                type: 'UPLOAD_STARTED',
                sessionId,
                userId,
                filename: req.file.originalname,
                scope: 'global',
            });

            await emitUploadEvent({
                type: 'PARSE_COMPLETE',
                sessionId,
                userId,
                scope: 'global',
                sheets: parsedData.sheets,
                rowCount: parsedData.results.length,
            });

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

    // POST /api/upload/confirm
    // Validates session exists then enqueues the ETL processing job.
    static async confirmUpload(req, res) {
        console.log(`📥 [upload] POST /api/upload/confirm — session: ${req.body?.sessionId} provider: ${req.body?.providerId}`);
        try {
            const { sessionId, providerId, mapping } = req.body;
            if (!sessionId || !providerId) {
                return res.status(400).json({ error: 'Missing sessionId or providerId' });
            }

            const fileExists = await redis.exists(`upload:${sessionId}:file`);
            if (!fileExists) {
                return res.status(404).json({ error: 'Session expired or not found' });
            }

            const userId = await redis.get(`upload:${sessionId}:owner`)
                || req.headers['x-user-id']
                || 'unknown';

            const job = await processQueue.add('process', {
                sessionId,
                providerId,
                mapping: mapping || null,
                userId,
            });

            return res.json({
                success: true,
                jobId: job.id,
                message: 'ETL processing enqueued',
            });

        } catch (error) {
            console.error('❌ [upload] confirmUpload error:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = UploadController;
