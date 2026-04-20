const { Worker } = require('bullmq');
const { minioClient, MINIO_BUCKET } = require('../config/minio');
const db = require('../config/db');
const redis = require('../config/redis');
const { connection } = require('../queues/etl.queues');

const auditWorker = new Worker('etl-audit', async (job) => {
    const { sessionId, userId, filename, fileBase64, fileSize } = job.data;

    const date = new Date().toISOString().split('T')[0];
    const minioPath = `audit/excels/${date}_${sessionId}_${filename}`;

    if (minioClient) {
        try {
            const buffer = Buffer.from(fileBase64, 'base64');
            await minioClient.putObject(MINIO_BUCKET, minioPath, buffer, fileSize);
            console.log(`✅ [audit-worker] MinIO backup: ${minioPath}`);
        } catch (err) {
            // Non-critical: log but don't fail the job
            console.error(`⚠️ [audit-worker] MinIO failed (continuing): ${err.message}`);
        }
    }

    const [logResult] = await db.query(
        `INSERT INTO upload_logs (user_id, original_filename, minio_path, file_size_bytes, status)
         VALUES (?, ?, ?, ?, 'processing')`,
        [userId, filename, minioPath, fileSize]
    );

    // Store logId so process.worker can update status later
    await redis.set(`upload:${sessionId}:logId`, logResult.insertId, 'EX', 7200);
    console.log(`📋 [audit-worker] upload_logs id=${logResult.insertId} user=${userId}`);

    return { logId: logResult.insertId };
}, { connection });

auditWorker.on('failed', (job, err) => {
    console.error(`❌ [audit-worker] job ${job?.id} failed: ${err.message}`);
});

module.exports = auditWorker;
