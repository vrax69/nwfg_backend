const { Worker }      = require('bullmq');
const ExcelService    = require('../services/excel.service');
const IndraParser     = require('../parsers/indra.parser');
const CinchParser     = require('../parsers/cinch.parser');
const redis           = require('../config/redis');
const db              = require('../config/db');
const { connection }  = require('../queues/etl.queues');
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

    // ── Determine parser for this provider ───────────────────────────────────
    const [[providerRow]] = await db.query(
        'SELECT parser_type FROM providers WHERE id = ?',
        [providerId]
    );
    const parserType = providerRow?.parser_type || 'default';
    console.log(`[process-worker] provider=${providerId} parser=${parserType}`);

    // ── Parse the file with the appropriate parser ────────────────────────────
    const buffer = Buffer.from(fileBase64, 'base64');
    let rows;

    if (parserType === 'indra') {
        rows = IndraParser.parse(buffer);
    } else if (parserType === 'cinch') {
        rows = CinchParser.parse(buffer);
    } else {
        const rawData = ExcelService.parseBuffer(buffer);
        rows = rawData.results;
    }

    const total          = rows.length;
    let processedCount   = 0;
    let ratesBatch       = [];

    // ── Choose the correct row-to-rate builder ────────────────────────────────
    const isAutoParser = parserType === 'indra' || parserType === 'cinch';

    for (const row of rows) {
        // ── Cancellation check — O(1) Redis read before each row ─────────────
        const status = await redis.get(`upload:${sessionId}:status`);
        if (status === 'cancelled') {
            console.log(`🛑 [process-worker] session ${sessionId?.slice(-6)} cancelled — stopping`);
            if (logId) await db.query(`UPDATE upload_logs SET status = 'cancelled' WHERE id = ?`, [logId]);
            return { status: 'cancelled', processed: processedCount };
        }

        // Resolve utility name → utility_id
        const rawUtil = isAutoParser
            ? (row.utility || null)
            : resolveUtilityColumn(row, mapping);

        if (rawUtil && isValidUtilityName(rawUtil)) {
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

            const rateObj = isAutoParser
                ? buildRateObjectDirect(row, utilId)
                : buildRateObject(row, utilId, mapping);

            ratesBatch.push(rateObj);
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

processWorker.on('progress',  (job, pct) => console.log(`⚙️  [process-worker] job ${job.id} — ${pct}%`));
processWorker.on('completed', (job, res) => console.log(`✅ [process-worker] job ${job.id} done:`, res));
processWorker.on('failed',    (job, err) => console.error(`❌ [process-worker] job ${job?.id} failed: ${err.message}`));

// ── Helpers ───────────────────────────────────────────────────────────────────

async function flushBatch(rates, sessionId, providerId, userId) {
    await redis.publish(ETL_CHANNEL, JSON.stringify({
        type: 'ETL_BATCH',
        sessionId,
        providerId,
        userId,
        rates,
    }));
}

/**
 * Build a rate object from a row that was already normalised by IndraParser or
 * CinchParser. Fields map 1:1 to canonical DB columns — no mapping lookup needed.
 */
function buildRateObjectDirect(row, utilityId) {
    return {
        external_id:      row.external_id      ?? null,
        company_dba_name: row.company_dba_name ?? null,
        product:          row.product          ?? null,
        state:            row.state            ?? null,
        pricing_type:     row.pricing_type     ?? null,
        segment:          row.segment          ?? null,
        cancellation:     row.cancellation     ?? null,
        utility_id:       utilityId,
        commodity:        row.commodity        || 'Electric',
        unit:             row.unit             || (row.commodity === 'Gas' ? 'Therms' : 'kWh'),
        rate_value:       row.rate_value       ?? null,
        ptc:              row.ptc              ?? null,
        msf:              row.msf              ?? null,
        term:             row.term             ?? null,
        attributes:       row.attributes       || null,
    };
}

/** Find the raw utility name value from the row using the admin mapping. */
function resolveUtilityColumn(row, mapping) {
    if (mapping) {
        const utilKey = Object.keys(mapping).find(k =>
            UTILITY_KEYS.includes(mapping[k]?.toLowerCase())
        );
        if (utilKey) return row[utilKey] || null;
    }
    for (const alias of UTILITY_KEYS) {
        const found = Object.keys(row).find(k => k.toLowerCase() === alias);
        if (found && row[found]) return row[found];
    }
    return null;
}

/**
 * Build a full rate object from a raw Excel row using the user's column mapping.
 * Used only for default (Spark-style) providers.
 */
function buildRateObject(row, utilityId, mapping) {
    const get = (canonical) => {
        if (mapping) {
            const key = Object.keys(mapping).find(k =>
                mapping[k]?.toLowerCase() === canonical.toLowerCase()
            );
            if (key !== undefined && row[key] !== undefined && row[key] !== '') return row[key];
        }
        const fallback = Object.keys(row).find(k =>
            k.toLowerCase().replace(/[^a-z]/g, '') === canonical.replace(/_/g, '')
        );
        return fallback ? row[fallback] : null;
    };

    const rawCommodity = (get(CANONICAL.COMMODITY) ?? 'Electric').toString().trim().toLowerCase();
    const commodity    = rawCommodity.startsWith('gas') ? 'Gas' : 'Electric';
    const unit         = get(CANONICAL.UNIT) || (commodity === 'Gas' ? 'Therms' : 'kWh');

    let rateValue = parseDecimal(get(CANONICAL.RATE_VALUE));
    if (rateValue !== null && commodity === 'Electric' && rateValue > 5) rateValue /= 100;

    const term = parseInt(get(CANONICAL.TERM)) || null;
    const ptc  = parseDecimal(get(CANONICAL.PTC));
    const msf  = parseDecimal(get(CANONICAL.MSF));

    const str = (key) => {
        const v = get(key);
        return v !== null && v !== undefined ? String(v).trim() : null;
    };

    const coreExcelKeys = new Set();
    if (mapping) {
        Object.entries(mapping).forEach(([excelCol, canonical]) => {
            if (CORE_KEYS.includes(canonical?.toLowerCase())) coreExcelKeys.add(excelCol);
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

function parseDecimal(value) {
    if (value === null || value === undefined || value === '') return null;
    const cleaned = String(value).replace(/[^0-9.\-]/g, '');
    const parsed  = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
}

/**
 * Guard against garbage rows being treated as unresolved utilities.
 * A valid utility name must be ≥ 3 chars, not purely numeric, and not
 * on the known-junk list (section dividers, metadata labels, etc.).
 */
const JUNK_NAMES = new Set([
    'n/a', 'na', 'none', 'null', 'undefined', '-', '--', '---',
    'yes', 'no', 'true', 'false',
    // Spanish metadata words that slip through on badly formatted sheets
    'sexo', 'tipo', 'estado', 'nombre', 'total', 'subtotal', 'otros',
    'zona', 'region', 'área', 'area', 'nota', 'notas', 'comentario',
]);

function isValidUtilityName(name) {
    if (!name) return false;
    const trimmed = String(name).trim();
    if (trimmed.length < 3)              return false; // too short
    if (/^\d+$/.test(trimmed))           return false; // purely numeric
    if (JUNK_NAMES.has(trimmed.toLowerCase())) return false;
    return true;
}

async function callResolveUtility(name) {
    try {
        const normalized = (name || '').trim().toUpperCase();

        const [aliasRows] = await db.query(
            'SELECT utility_id FROM utility_aliases WHERE UPPER(TRIM(dirty_name)) = ?',
            [normalized]
        );
        if (aliasRows.length > 0) return aliasRows[0].utility_id;

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
