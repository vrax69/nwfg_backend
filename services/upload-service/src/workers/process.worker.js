const { Worker } = require('bullmq');
const axios = require('axios');
const ExcelService = require('../services/excel.service');
const redis = require('../config/redis');
const db = require('../config/db');
const { connection } = require('../queues/etl.queues');
const { emitUploadEvent } = require('../events/emit');

const RATES_SERVICE_URL = process.env.RATES_SERVICE_URL || 'http://rates-service:4002';
const BATCH_SIZE = 50;

const processWorker = new Worker('etl-process', async (job) => {
    const { sessionId, providerId, mapping, userId } = job.data;

    const logId = await redis.get(`upload:${sessionId}:logId`);

    const fileBase64 = await redis.get(`upload:${sessionId}:file`);
    if (!fileBase64) {
        if (logId) await db.query(`UPDATE upload_logs SET status = 'failed' WHERE id = ?`, [logId]);
        throw new Error(`Session ${sessionId} expired or file missing in Redis`);
    }

    const buffer = Buffer.from(fileBase64, 'base64');
    const rawData = ExcelService.parseBuffer(buffer);
    const rows = rawData.results;
    const total = rows.length;

    let processedCount = 0;
    let ratesBatch = [];

    for (const row of rows) {
        const rawUtil = resolveUtilityColumn(row, mapping);

        if (rawUtil) {
            const utilId = await callResolveUtility(rawUtil);

            if (!utilId) {
                // Local: wizard shows inline error (uploader only)
                await emitUploadEvent({ type: 'MISSING_ALIAS', sessionId, userId, scope: 'local', dirtyName: rawUtil });
                // Global: other tabs see the upload stopped
                await emitUploadEvent({ type: 'UPLOAD_COMPLETE', sessionId, userId, scope: 'global', total: processedCount, providerId, error: 'missing_alias', dirtyName: rawUtil });
                if (logId) await db.query(`UPDATE upload_logs SET status = 'failed' WHERE id = ?`, [logId]);
                return { status: 'missing_alias', dirtyName: rawUtil };
            }

            ratesBatch.push(buildRateObject(row, utilId, mapping));
        }

        if (ratesBatch.length >= BATCH_SIZE) {
            await axios.post(`${RATES_SERVICE_URL}/rates/bulk`, {
                provider_id: providerId,
                rates: ratesBatch,
            });
            processedCount += ratesBatch.length;
            ratesBatch = [];

            const percent = Math.round((processedCount / total) * 100);
            await job.updateProgress(percent);

            await emitUploadEvent({
                type: 'UPLOAD_PROGRESS',
                sessionId,
                userId,
                scope: 'global',
                processed: processedCount,
                total,
                percent,
            });
        }
    }

    // Flush remaining rows
    if (ratesBatch.length > 0) {
        await axios.post(`${RATES_SERVICE_URL}/rates/bulk`, {
            provider_id: providerId,
            rates: ratesBatch,
        });
        processedCount += ratesBatch.length;
    }

    if (logId) {
        await db.query(`UPDATE upload_logs SET status = 'completed' WHERE id = ?`, [logId]);
    }

    await emitUploadEvent({
        type: 'UPLOAD_COMPLETE',
        sessionId,
        userId,
        scope: 'global',
        total: processedCount,
        providerId,
    });

    return { status: 'completed', processed: processedCount };
}, { connection });

processWorker.on('progress', (job, progress) => {
    console.log(`⚙️ [process-worker] job ${job.id} — ${progress}%`);
});

processWorker.on('completed', (job, result) => {
    console.log(`✅ [process-worker] job ${job.id} done:`, result);
});

processWorker.on('failed', (job, err) => {
    console.error(`❌ [process-worker] job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`);
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveUtilityColumn(row, mapping) {
    // mapping is { sourceColumn: 'canonical_key', ... } from FE column mapper
    // Falls back to common column names if no mapping provided
    if (mapping) {
        const utilKey = Object.keys(mapping).find(k =>
            ['utility', 'ldc', 'distributor'].includes(mapping[k]?.toLowerCase())
        );
        if (utilKey) return row[utilKey] || null;
    }
    return row['Utility'] || row['utility'] || row['LDC'] || row['ldc'] || null;
}

function buildRateObject(row, utilityId, mapping) {
    const get = (canonical) => {
        if (mapping) {
            const key = Object.keys(mapping).find(k => mapping[k]?.toLowerCase() === canonical);
            if (key && row[key] !== undefined) return row[key];
        }
        const fallbackKey = Object.keys(row).find(k => k.toLowerCase().includes(canonical));
        return fallbackKey ? row[fallbackKey] : null;
    };

    let rateValue = get('rate') ?? get('price');
    const term = get('term') ?? get('duration');
    const commodity = get('commodity') ?? 'ELECTRIC';

    if (typeof rateValue === 'number' && commodity === 'ELECTRIC' && rateValue > 5) {
        rateValue = rateValue / 100;
    }

    const attributes = { ...row };
    ['rate', 'price', 'term', 'duration', 'utility', 'ldc', 'commodity'].forEach(ck => {
        Object.keys(row).forEach(k => {
            if (k.toLowerCase().includes(ck)) delete attributes[k];
        });
    });

    return {
        utility_id: utilityId,
        rate_value: typeof rateValue === 'number' ? rateValue : null,
        term: typeof term === 'number' ? term : parseInt(term) || 0,
        commodity: commodity.toUpperCase(),
        attributes,
    };
}

async function callResolveUtility(name) {
    try {
        const res = await axios.post(`${RATES_SERVICE_URL}/utilities/resolve`, { dirtyName: name });
        if (res.data.success) return res.data.utilityId;
    } catch (_) {
        return null;
    }
    return null;
}

module.exports = processWorker;
