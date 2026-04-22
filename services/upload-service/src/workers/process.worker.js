const { Worker } = require('bullmq');
const ExcelService = require('../services/excel.service');
const redis = require('../config/redis');
const db = require('../config/db');
const { connection } = require('../queues/etl.queues');
const { emitUploadEvent } = require('../events/emit');
const { CANONICAL, UTILITY_KEYS, CORE_KEYS } = require('../constants/canonicalKeys');

const ETL_CHANNEL = 'ETL_EVENTS';
const BATCH_SIZE  = 50;

const processWorker = new Worker('etl-process', async (job) => {
    const { sessionId, providerId, mapping, userId } = job.data;

    const logId      = await redis.get(`upload:${sessionId}:logId`);
    const fileBase64 = await redis.get(`upload:${sessionId}:file`);

    if (!fileBase64) {
        if (logId) await db.query(`UPDATE upload_logs SET status = 'failed' WHERE id = ?`, [logId]);
        throw new Error(`Session ${sessionId} expired or file missing in Redis`);
    }

    const buffer  = Buffer.from(fileBase64, 'base64');
    const rawData = ExcelService.parseBuffer(buffer);
    const rows    = rawData.results;
    const total   = rows.length;

    let processedCount = 0;
    let ratesBatch     = [];

    for (const row of rows) {
        const rawUtil = resolveUtilityColumn(row, mapping);

        if (rawUtil) {
            const utilId = await callResolveUtility(rawUtil);

            if (!utilId) {
                await redis.set(`upload:${sessionId}:status`, 'awaiting_user', 'EX', 7200);
                await emitUploadEvent({
                    type:      'AWAITING_USER',
                    sessionId,
                    userId,
                    scope:     'local',
                    dirtyName: rawUtil,
                    message:   `No se encontró alias para "${rawUtil}". Selecciona la utilidad correcta para continuar.`,
                });
                if (logId) await db.query(`UPDATE upload_logs SET status = 'failed' WHERE id = ?`, [logId]);
                return { status: 'awaiting_user', dirtyName: rawUtil };
            }

            ratesBatch.push(buildRateObject(row, utilId, mapping));
        }

        if (ratesBatch.length >= BATCH_SIZE) {
            await flushBatch(ratesBatch, sessionId, providerId, userId);
            processedCount += ratesBatch.length;
            ratesBatch = [];

            const percent = Math.round((processedCount / total) * 100);
            await job.updateProgress(percent);
            await emitUploadEvent({
                type:      'UPLOAD_PROGRESS',
                sessionId,
                userId,
                scope:     'global',
                processed: processedCount,
                total,
                percent,
            });
        }
    }

    // Flush remaining rows
    if (ratesBatch.length > 0) {
        await flushBatch(ratesBatch, sessionId, providerId, userId);
        processedCount += ratesBatch.length;
    }

    if (logId) await db.query(`UPDATE upload_logs SET status = 'completed' WHERE id = ?`, [logId]);

    await emitUploadEvent({
        type:      'UPLOAD_COMPLETE',
        sessionId,
        userId,
        scope:     'global',
        total:     processedCount,
        providerId,
    });

    return { status: 'completed', processed: processedCount };
}, { connection });

processWorker.on('progress',   (job, pct)  => console.log(`⚙️  [process-worker] job ${job.id} — ${pct}%`));
processWorker.on('completed',  (job, res)  => console.log(`✅ [process-worker] job ${job.id} done:`, res));
processWorker.on('failed',     (job, err)  => console.error(`❌ [process-worker] job ${job?.id} failed: ${err.message}`));

// ── Helpers ──────────────────────────────────────────────────────────────────

async function flushBatch(rates, sessionId, providerId, userId) {
    await redis.publish(ETL_CHANNEL, JSON.stringify({
        type: 'ETL_BATCH',
        sessionId,
        providerId,
        userId,
        rates,
    }));
}

/** Find the raw utility name value from the row using the admin mapping. */
function resolveUtilityColumn(row, mapping) {
    if (mapping) {
        const utilKey = Object.keys(mapping).find(k =>
            UTILITY_KEYS.includes(mapping[k]?.toLowerCase())
        );
        if (utilKey) return row[utilKey] || null;
    }
    // Fallback: scan row keys for any utility alias
    for (const alias of UTILITY_KEYS) {
        const found = Object.keys(row).find(k => k.toLowerCase() === alias);
        if (found && row[found]) return row[found];
    }
    return null;
}

/**
 * Build a full rate object from a single Excel row.
 * Uses the admin mapping first, falls back to fuzzy key scan.
 */
function buildRateObject(row, utilityId, mapping) {
    // Returns the value from the row whose mapped canonical key matches `canonical`
    const get = (canonical) => {
        if (mapping) {
            const key = Object.keys(mapping).find(k =>
                mapping[k]?.toLowerCase() === canonical.toLowerCase()
            );
            if (key !== undefined && row[key] !== undefined && row[key] !== '') return row[key];
        }
        // Fallback: loose key match
        const fallback = Object.keys(row).find(k =>
            k.toLowerCase().replace(/[^a-z]/g, '') === canonical.replace(/_/g, '')
        );
        return fallback ? row[fallback] : null;
    };

    // ── Commodity ─────────────────────────────────────────────────────────
    const rawCommodity = (get(CANONICAL.COMMODITY) ?? 'Electric').toString().trim().toLowerCase();
    const commodity    = rawCommodity.startsWith('gas') ? 'Gas' : 'Electric';

    // ── Unit ──────────────────────────────────────────────────────────────
    const unit = get(CANONICAL.UNIT) || (commodity === 'Gas' ? 'Therms' : 'kWh');

    // ── Rate value ────────────────────────────────────────────────────────
    let rateValue = parseDecimal(get(CANONICAL.RATE_VALUE));
    // Electric rates sometimes arrive in cents (> 5 $/kWh is physically impossible)
    if (rateValue !== null && commodity === 'Electric' && rateValue > 5) {
        rateValue = rateValue / 100;
    }

    // ── Term ──────────────────────────────────────────────────────────────
    const term = parseInt(get(CANONICAL.TERM)) || null;

    // ── PTC ───────────────────────────────────────────────────────────────
    const ptc = parseDecimal(get(CANONICAL.PTC));

    // ── MSF ───────────────────────────────────────────────────────────────
    const msf = parseDecimal(get(CANONICAL.MSF));

    // ── String fields ─────────────────────────────────────────────────────
    const str = (key) => {
        const v = get(key);
        return v !== null && v !== undefined ? String(v).trim() : null;
    };

    // ── attributes: everything NOT mapped to a core column ────────────────
    // Build a Set of all Excel column names that are mapped to core keys
    const coreExcelKeys = new Set();
    if (mapping) {
        Object.entries(mapping).forEach(([excelCol, canonical]) => {
            if (CORE_KEYS.includes(canonical?.toLowerCase())) {
                coreExcelKeys.add(excelCol);
            }
        });
    }
    const attributes = {};
    Object.keys(row).forEach(k => {
        if (!coreExcelKeys.has(k) && row[k] !== '' && row[k] !== null && row[k] !== undefined) {
            attributes[k] = row[k];
        }
    });

    return {
        external_id:      str(CANONICAL.EXTERNAL_ID),
        company_dba_name: str(CANONICAL.COMPANY_DBA_NAME),
        product:          str(CANONICAL.PRODUCT),
        state:            str(CANONICAL.STATE),
        pricing_type:     str(CANONICAL.PRICING_TYPE),
        segment:          str(CANONICAL.SEGMENT),
        cancellation:     str(CANONICAL.CANCELLATION),
        utility_id:       utilityId,
        commodity,
        unit,
        rate_value:       rateValue,
        ptc,
        msf,
        term,
        attributes:       Object.keys(attributes).length > 0 ? attributes : null,
    };
}

/** Parse a value to float, stripping currency symbols and whitespace. */
function parseDecimal(value) {
    if (value === null || value === undefined || value === '') return null;
    const cleaned = String(value).replace(/[^0-9.\-]/g, '');
    const parsed  = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
}

/** Resolve utility name → utility_id via alias table then canonical name. */
async function callResolveUtility(name) {
    try {
        const normalized = (name || '').trim().toUpperCase();

        // 1. Try alias table first (dirty names from Excel)
        const [aliasRows] = await db.query(
            'SELECT utility_id FROM utility_aliases WHERE UPPER(TRIM(dirty_name)) = ?',
            [normalized]
        );
        if (aliasRows.length > 0) return aliasRows[0].utility_id;

        // 2. Fallback: canonical utility name (exact match)
        const [utilRows] = await db.query(
            'SELECT id FROM utilities WHERE UPPER(TRIM(nombre)) = ?',
            [normalized]
        );
        if (utilRows.length > 0) return utilRows[0].id;

    } catch (err) {
        console.error('❌ [process.worker] resolveUtility DB error:', err.message);
    }
    return null;
}

module.exports = processWorker;
