const ExcelService = require('../services/excel.service');
const redis = require('../config/redis');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const Minio = require('minio');

// MinIO client - Only active if env vars are set
let minioClient = null;
if (process.env.MINIO_ENDPOINT) {
    minioClient = new Minio.Client({
        endPoint: process.env.MINIO_ENDPOINT || 'minio',
        port: parseInt(process.env.MINIO_PORT) || 9000,
        useSSL: false,
        accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
        secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
    });
}

class UploadController {

    // 1. UPLOAD START
    static async uploadFile(req, res) {
        try {
            if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

            // Extract userId from Gateway-injected header
            const userId = req.headers['x-user-id'] || 'unknown';
            const sessionId = uuidv4();
            const fileBase64 = req.file.buffer.toString('base64');

            // Store file + owner in Redis with 1h expiration
            await redis.set(`upload:${sessionId}:file`, fileBase64, 'EX', 3600);
            await redis.set(`upload:${sessionId}:owner`, userId, 'EX', 3600);

            // --- MINIO BACKUP (Audit Trail) ---
            // Save original file stream to MinIO before any processing.
            // This is fire-and-forget so failures don't block the upload flow.
            if (minioClient) {
                const bucket = process.env.MINIO_BUCKET || 'nwfg-frontend';
                const objectName = `uploads/${sessionId}/${req.file.originalname}`;
                minioClient.putObject(bucket, objectName, req.file.buffer, req.file.size)
                    .then(() => console.log(`✅ MinIO: ${objectName} backed up`))
                    .catch(err => console.error('⚠️ MinIO backup failed (non-blocking):', err.message));
            }

            // Emit UPLOAD_STARTED — includes userId so Gateway can route it
            await redis.publish('UPLOAD_EVENTS', JSON.stringify({
                type: 'UPLOAD_STARTED',
                sessionId,
                userId,                        // <-- Context: who started this upload
                filename: req.file.originalname,
                scope: 'local',                // 'local' = only show to this admin
                timestamp: new Date()
            }));

            // Parse headers for mapping preview (no rate processing yet)
            const parsedData = ExcelService.parseBuffer(req.file.buffer);

            // Emit PARSE_COMPLETE
            await redis.publish('UPLOAD_EVENTS', JSON.stringify({
                type: 'PARSE_COMPLETE',
                sessionId,
                userId,
                scope: 'local',
                sheets: parsedData.sheets,
                rowCount: parsedData.results.length,
                timestamp: new Date()
            }));

            return res.json({
                success: true,
                sessionId,
                message: 'File uploaded. Please confirm mapping.',
                headers: parsedData.headers,
                rowCount: parsedData.results.length
            });

        } catch (error) {
            console.error('Upload Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // 2. CONFIRM & PROCESS (Bulk Insert)
    static async confirmUpload(req, res) {
        const { sessionId, providerId, mapping } = req.body;
        if (!sessionId || !providerId) return res.status(400).json({ error: 'Missing session or provider' });

        // Retrieve the owner of this session
        const userId = await redis.get(`upload:${sessionId}:owner`) || req.headers['x-user-id'] || 'unknown';

        // Fire & forget async processing — progress tracked via Redis events
        UploadController.processSession(sessionId, providerId, mapping, userId).catch(err => {
            console.error("Async Processing Failed:", err);
        });

        return res.json({ success: true, message: 'Processing started in background' });
    }

    // INTERNAL PROCESSOR
    static async processSession(sessionId, providerId, mapping, userId = 'unknown') {
        console.log(`⚙️ Processing Session ${sessionId}`);

        const fileBase64 = await redis.get(`upload:${sessionId}:file`);
        if (!fileBase64) {
            console.error("Session expired or missing file");
            return;
        }

        const buffer = Buffer.from(fileBase64, 'base64');
        // Re-parse with mapping applied (if ExcelService supports mapping injection)
        // Current ExcelService.parseBuffer returns raw data. We need to map it.
        // We'll perform raw parse, then mapping logic here or in Service.

        const rawData = ExcelService.parseBuffer(buffer);
        // Assume mapping is applied here or we iterate rawData.results
        // Let's assume rawData.results is Array of Objects

        const BATCH_SIZE = 50;
        let processedCount = 0;
        let ratesBatch = [];
        const RATES_SERVICE_URL = process.env.RATES_SERVICE_URL || 'http://rates-service:4002';

        for (const row of rawData.results) {
            // 1. Resolve Utility Alias
            // We check raw utility name against Rates Service
            const rawUtil = row['Utility'] || row['utility'] || row['LDC']; // Depends on mapping
            if (rawUtil) {
                let utilId = await UploadController.resolveUtility(rawUtil, RATES_SERVICE_URL);

                if (!utilId) {
                    // MISSING ALIAS — emit with full context so Gateway routes it only to this admin
                    await redis.publish('UPLOAD_EVENTS', JSON.stringify({
                        type: 'MISSING_ALIAS',
                        sessionId,
                        userId,                // <-- Who uploaded → FE shows error only in their mapping table
                        scope: 'local',        // 'local' = route only to this userId's session
                        dirtyName: rawUtil,
                        timestamp: new Date()
                    }));

                    console.log(`⏸ Pausing due to missing alias: ${rawUtil}`);
                    return; // Abort batch. Admin resolves alias and resubmits /confirm.
                }

                // Map Rate Object
                const rateObj = {
                    ...row,
                    utility_id: utilId,
                    // context aware pricing logic...
                };
                // Packaging attributes...
                ratesBatch.push(rateObj);
            }

            if (ratesBatch.length >= BATCH_SIZE) {
                // Send Batch
                await axios.post(`${RATES_SERVICE_URL}/rates/bulk`, {
                    provider_id: providerId,
                    rates: ratesBatch
                });

                processedCount += ratesBatch.length;
                ratesBatch = []; // Clear

                // Emit Progress — global scope, all agents can see upload is happening
                await redis.publish('UPLOAD_EVENTS', JSON.stringify({
                    type: 'UPLOAD_PROGRESS',
                    sessionId,
                    userId,
                    scope: 'global',           // 'global' = everyone sees the loading indicator
                    processed: processedCount,
                    total: rawData.results.length,
                    percent: Math.round((processedCount / rawData.results.length) * 100),
                    timestamp: new Date()
                }));
            }
        }

        // Flush Remaining
        if (ratesBatch.length > 0) {
            await axios.post(`${RATES_SERVICE_URL}/rates/bulk`, { provider_id: providerId, rates: ratesBatch });
            processedCount += ratesBatch.length;
        }

        // UPLOAD_COMPLETE is global — triggers Sileo toast for all connected users
        await redis.publish('UPLOAD_EVENTS', JSON.stringify({
            type: 'UPLOAD_COMPLETE',
            sessionId,
            userId,
            scope: 'global',                   // Everyone sees "New rates available!"
            total: processedCount,
            providerId,
            timestamp: new Date()
        }));
    }

    static async resolveUtility(name, serviceUrl) {
        // Check cache first?
        try {
            const res = await axios.post(`${serviceUrl}/utilities/resolve`, { dirtyName: name });
            if (res.data.success) return res.data.utilityId;
        } catch (e) {
            // 404 means not found
            return null;
        }
        return null;
    }
}

module.exports = UploadController;
