/**
 * IndraParser — multi-sheet, multi-section Indra Energy rate file parser.
 *
 * Indra format:
 *   - One sheet per state (WASHINGTON DC, DELAWARE, …)
 *   - Each sheet contains 1-3 sections separated by blank rows
 *   - Each section has: title row → blank rows → header row → data rows
 *   - state    derived from sheet name
 *   - commodity derived from header ("GAS UTILITY" | "ELECTRIC UTILITY")
 *   - pricing_type derived from section title text
 *   - CINCH sheet is skipped (handled by CinchParser)
 */

'use strict';

const xlsx = require('xlsx');

// ── State name map ────────────────────────────────────────────────────────────
const SHEET_TO_STATE = {
    'WASHINGTON DC':  'Washington DC',
    'DELAWARE':       'Delaware',
    'INDIANA':        'Indiana',
    'MASSACHUSETTS':  'Massachusetts',
    'MICHIGAN':       'Michigan',
    'NEW JERSEY':     'New Jersey',
    'NEW YORK':       'New York',
    'PENNSYLVANIA':   'Pennsylvania',
    'VIRGINIA':       'Virginia',
};

// ── Excel header → canonical DB field ────────────────────────────────────────
// Normalised key: lowercase, strip *, newlines, extra spaces
const HEADER_CANONICAL = {
    'gas utility':                 'utility',
    'electric utility':            'utility',
    'intro rate':                  'rate_value',
    'initial rate':                'rate_value',
    'secondary rate':              'secondary_rate',   // → attributes
    'intro period':                'term',
    'full term length':            'term',
    'utility gas rate':            'ptc',
    'utility electric rate':       'ptc',
    'utility electric rate*':      'ptc',
    'etf per remaining month':     'cancellation',
    '% of savings':                'savings_pct',      // → attributes
    '% savings':                   'savings_pct',
    'bill estimate @ 75 therms':   'bill_est_75t',     // → attributes
    'initial length':              'initial_length',   // → attributes
    'secondary length':            'secondary_length', // → attributes
};

// Core fields that get their own column; everything else → attributes
const CORE_FIELDS = new Set(['utility', 'rate_value', 'term', 'ptc', 'cancellation']);

// ── Helpers ───────────────────────────────────────────────────────────────────

function normHeader(h) {
    if (!h) return '';
    return h.toString().toLowerCase()
        .replace(/[\*\n\r]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function derivePricingType(titleText) {
    const t = (titleText || '').toLowerCase();
    if (t.includes('2 phase') || t.includes('2-phase') || t.includes('two phase')) return '2-phase-fixed';
    if (t.includes('variable')) return 'variable';
    if (t.includes('fixed'))    return 'fixed';
    return 'variable';
}

function deriveCommodity(headers) {
    const combined = headers.map(normHeader).join(' ');
    if (combined.includes('gas utility'))      return 'Gas';
    if (combined.includes('electric utility')) return 'Electric';
    return 'Electric';
}

function isEmptyRow(row) {
    return !row || row.every(c => c === null || c === undefined || String(c).trim() === '');
}

/**
 * A "section title" row has content only in the first 1-2 cells and
 * contains rate-type keywords — but does NOT look like a header row.
 */
function isSectionTitle(row) {
    const nonEmpty = row.filter(c => c !== null && c !== undefined && String(c).trim() !== '');
    if (nonEmpty.length === 0 || nonEmpty.length > 2) return false;
    const text = normHeader(String(row[0] || ''));
    const hasRateWord = /variable|fixed|phase|rates|intro|telesale/.test(text);
    const isHeaderLike = /utility|period|length|savings/.test(text);
    return hasRateWord && !isHeaderLike;
}

/**
 * A header row has ≥ 3 non-null cells and contains rate-related keywords.
 */
function isHeaderRow(row) {
    const nonEmpty = row.filter(c => c !== null && c !== undefined && String(c).trim() !== '');
    if (nonEmpty.length < 3) return false;
    const combined = row.map(c => normHeader(String(c || ''))).join(' ');
    return /utility|intro rate|initial rate|full term|intro period/.test(combined);
}

function parseDecimal(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = parseFloat(String(v).replace(/[$%,\s]/g, '').replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? null : n;
}

function normalizeTerm(raw) {
    if (raw === null || raw === undefined) return null;
    const n = parseInt(String(raw), 10);
    return isNaN(n) ? null : n;
}

// ── Main parser ───────────────────────────────────────────────────────────────

class IndraParser {
    /**
     * @param {Buffer} buffer  Raw Excel file buffer
     * @returns {Array<Object>} Normalised rate rows ready for ETL worker
     */
    static parse(buffer) {
        const wb      = xlsx.read(buffer, { type: 'buffer' });
        const results = [];

        for (const sheetName of wb.SheetNames) {
            // CINCH sheet — flat table with its own structure, parse inline
            if (sheetName.toUpperCase() === 'CINCH') {
                const cinchRows = parseCinchSheet(wb.Sheets[sheetName]);
                results.push(...cinchRows);
                continue;
            }

            const state   = SHEET_TO_STATE[sheetName.toUpperCase()] || sheetName;
            const sheet   = wb.Sheets[sheetName];
            const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });

            let pricingType    = 'variable';  // default for the sheet
            let inBlock        = false;
            let headers        = [];          // normalised header names
            let rawHeaders     = [];          // original strings (for attributes keys)
            let commodity      = 'Electric';
            let canonicalMap   = {};          // index → canonical field name

            for (let i = 0; i < rawRows.length; i++) {
                const row = rawRows[i];

                if (isEmptyRow(row)) {
                    inBlock = false;
                    continue;
                }

                if (!inBlock) {
                    if (isSectionTitle(row)) {
                        pricingType = derivePricingType(String(row[0] || ''));
                        continue;
                    }

                    if (isHeaderRow(row)) {
                        rawHeaders   = row.map(c => c !== null ? String(c).trim().replace(/\n/g, ' ') : '');
                        headers      = rawHeaders.map(normHeader);
                        commodity    = deriveCommodity(rawHeaders);
                        canonicalMap = {};
                        headers.forEach((h, idx) => {
                            const canonical = HEADER_CANONICAL[h];
                            if (canonical) canonicalMap[idx] = canonical;
                        });
                        inBlock = true;
                        continue;
                    }
                } else {
                    // If we hit another header row mid-block (sub-section), re-map
                    if (isHeaderRow(row)) {
                        rawHeaders   = row.map(c => c !== null ? String(c).trim().replace(/\n/g, ' ') : '');
                        headers      = rawHeaders.map(normHeader);
                        commodity    = deriveCommodity(rawHeaders);
                        canonicalMap = {};
                        headers.forEach((h, idx) => {
                            const canonical = HEADER_CANONICAL[h];
                            if (canonical) canonicalMap[idx] = canonical;
                        });
                        continue;
                    }

                    // ── Data row ──────────────────────────────────────────────
                    const core       = {};   // canonical-keyed fields
                    const attributes = {};

                    headers.forEach((h, idx) => {
                        if (!h) return;
                        const cell = row[idx];
                        if (cell === null || cell === undefined || String(cell).trim() === '') return;

                        const canonical = canonicalMap[idx];
                        if (!canonical) {
                            // unmapped → attributes using original header as key
                            attributes[rawHeaders[idx] || h] = cell;
                            return;
                        }
                        if (CORE_FIELDS.has(canonical)) {
                            core[canonical] = cell;
                        } else {
                            // known but non-core (savings_pct, bill_est, secondary_*) → attributes
                            attributes[canonical] = cell;
                        }
                    });

                    // Must have a utility name
                    if (!core.utility) continue;

                    // Skip rows where utility cell looks like a repeated header
                    const utilStr = normHeader(String(core.utility));
                    if (utilStr === 'gas utility' || utilStr === 'electric utility') continue;

                    // ── Normalise numeric fields ──────────────────────────────
                    let rateValue = parseDecimal(core.rate_value);
                    let ptcValue  = parseDecimal(core.ptc);

                    // Electric rates arriving in cents (> 5 is physically impossible per kWh)
                    if (commodity === 'Electric') {
                        if (rateValue !== null && rateValue > 5) rateValue /= 100;
                        if (ptcValue  !== null && ptcValue  > 5) ptcValue  /= 100;
                    }

                    results.push({
                        // Identity
                        utility:      String(core.utility).trim(),
                        state,
                        commodity,
                        pricing_type: pricingType,
                        unit:         commodity === 'Gas' ? 'Therms' : 'kWh',
                        // Pricing
                        rate_value:   rateValue,
                        ptc:          ptcValue,
                        term:         normalizeTerm(core.term),
                        cancellation: core.cancellation ? String(core.cancellation).trim() : null,
                        // Everything else
                        attributes:   Object.keys(attributes).length > 0 ? attributes : null,
                    });
                }
            }
        }

        console.log(`[IndraParser] Parsed ${results.length} rows from Indra file`);
        return results;
    }
}

// ── CINCH inline parser ───────────────────────────────────────────────────────
// CINCH is a sheet inside the Indra rate file with a flat table (headers in row 1).
// All CINCH rows are stored under the same Indra provider_id.

const STATE_MAP = {
    AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California',
    CO:'Colorado', CT:'Connecticut', DE:'Delaware', DC:'Washington DC',
    FL:'Florida', GA:'Georgia', HI:'Hawaii', ID:'Idaho', IL:'Illinois',
    IN:'Indiana', IA:'Iowa', KS:'Kansas', KY:'Kentucky', LA:'Louisiana',
    ME:'Maine', MD:'Maryland', MA:'Massachusetts', MI:'Michigan', MN:'Minnesota',
    MS:'Mississippi', MO:'Missouri', MT:'Montana', NE:'Nebraska', NV:'Nevada',
    NH:'New Hampshire', NJ:'New Jersey', NM:'New Mexico', NY:'New York',
    NC:'North Carolina', ND:'North Dakota', OH:'Ohio', OK:'Oklahoma',
    OR:'Oregon', PA:'Pennsylvania', RI:'Rhode Island', SC:'South Carolina',
    SD:'South Dakota', TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont',
    VA:'Virginia', WA:'Washington', WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming',
};

function expandState(abbrev) {
    if (!abbrev) return null;
    const u = String(abbrev).trim().toUpperCase();
    return STATE_MAP[u] || abbrev;
}

function normalizeSegment(type) {
    if (!type) return null;
    const t = String(type).toLowerCase();
    if (t.includes('home') || t.includes('owner') || t.includes('rent')) return 'Residential';
    if (t.includes('commercial') || t.includes('business')) return 'Commercial';
    return String(type).trim();
}

function parseCinchSheet(sheet) {
    const rows    = xlsx.utils.sheet_to_json(sheet, { defval: null });
    const results = [];

    for (const row of rows) {
        const utility   = row['ELECTRIC UTILITY'] || row['GAS UTILITY'] || null;
        if (!utility) continue;

        const kwhThresh = parseDecimal(row['KWH THERSHOLD'] ?? row['KWH THRESHOLD']);
        const rateUnder = parseDecimal(row['MONTHLY FLAT RATE UNDER KWH']);
        const rateOver  = parseDecimal(row['MONTHLY FLAT RATE OVER KWH']);

        const attributes = {};
        if (kwhThresh !== null) attributes.kwh_threshold            = kwhThresh;
        if (rateOver  !== null) attributes.rate_over_kwh_threshold  = rateOver;

        results.push({
            utility:      String(utility).trim(),
            state:        expandState(row['STATE'] || null),
            commodity:    'Electric',
            pricing_type: 'flat_monthly',
            segment:      normalizeSegment(row['TYPE'] || null),
            unit:         'kWh',
            rate_value:   rateUnder,
            ptc:          null,
            term:         normalizeTerm(row['TERM LENGTH']),
            cancellation: null,
            attributes:   Object.keys(attributes).length > 0 ? attributes : null,
        });
    }

    console.log(`[IndraParser] CINCH sheet → ${results.length} rows`);
    return results;
}

module.exports = IndraParser;
