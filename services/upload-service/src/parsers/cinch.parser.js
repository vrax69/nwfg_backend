/**
 * CinchParser — parses the CINCH sheet from an Indra Energy rate file.
 *
 * CINCH format (flat table, headers in row 1):
 *   ELECTRIC UTILITY | STATE | TYPE | KWH THERSHOLD |
 *   MONTHLY FLAT RATE UNDER KWH | MONTHLY FLAT RATE OVER KWH | TERM LENGTH
 *
 * pricing_type = 'flat_monthly'
 * commodity    = 'Electric' (always)
 * segment      = TYPE field (Homeowner → Residential, Renter → Residential)
 */

'use strict';

const xlsx = require('xlsx');

// US state abbreviation → full name
const STATE_MAP = {
    AL: 'Alabama',       AK: 'Alaska',        AZ: 'Arizona',       AR: 'Arkansas',
    CA: 'California',    CO: 'Colorado',       CT: 'Connecticut',   DE: 'Delaware',
    DC: 'Washington DC', FL: 'Florida',        GA: 'Georgia',       HI: 'Hawaii',
    ID: 'Idaho',         IL: 'Illinois',       IN: 'Indiana',       IA: 'Iowa',
    KS: 'Kansas',        KY: 'Kentucky',       LA: 'Louisiana',     ME: 'Maine',
    MD: 'Maryland',      MA: 'Massachusetts',  MI: 'Michigan',      MN: 'Minnesota',
    MS: 'Mississippi',   MO: 'Missouri',       MT: 'Montana',       NE: 'Nebraska',
    NV: 'Nevada',        NH: 'New Hampshire',  NJ: 'New Jersey',    NM: 'New Mexico',
    NY: 'New York',      NC: 'North Carolina', ND: 'North Dakota',  OH: 'Ohio',
    OK: 'Oklahoma',      OR: 'Oregon',         PA: 'Pennsylvania',  RI: 'Rhode Island',
    SC: 'South Carolina',SD: 'South Dakota',   TN: 'Tennessee',     TX: 'Texas',
    UT: 'Utah',          VT: 'Vermont',        VA: 'Virginia',      WA: 'Washington',
    WV: 'West Virginia', WI: 'Wisconsin',      WY: 'Wyoming',
};

function expandState(abbrev) {
    if (!abbrev) return null;
    const upper = String(abbrev).trim().toUpperCase();
    return STATE_MAP[upper] || abbrev;
}

function parseDecimal(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? null : n;
}

function normalizeTerm(raw) {
    if (raw === null || raw === undefined) return null;
    const n = parseInt(String(raw), 10);
    return isNaN(n) ? null : n;
}

// Normalize TYPE to a segment value
function normalizeSegment(type) {
    if (!type) return null;
    const t = String(type).toLowerCase();
    if (t.includes('home') || t.includes('owner')) return 'Residential';
    if (t.includes('rent'))                          return 'Residential';
    if (t.includes('commercial') || t.includes('business')) return 'Commercial';
    return String(type).trim();
}

class CinchParser {
    /**
     * @param {Buffer} buffer  Raw Excel file buffer (must contain a CINCH sheet)
     * @returns {Array<Object>} Normalised rate rows ready for ETL worker
     */
    static parse(buffer) {
        const wb = xlsx.read(buffer, { type: 'buffer' });

        // Accept any sheet named "CINCH" (case-insensitive)
        const sheetName = wb.SheetNames.find(n => n.toUpperCase() === 'CINCH');
        if (!sheetName) {
            console.warn('[CinchParser] No CINCH sheet found in workbook');
            return [];
        }

        const sheet   = wb.Sheets[sheetName];
        const rows    = xlsx.utils.sheet_to_json(sheet, { defval: null });
        const results = [];

        for (const row of rows) {
            // Support minor typo variations in the header (THERSHOLD / THRESHOLD)
            const utility     = row['ELECTRIC UTILITY'] || row['GAS UTILITY'] || null;
            const stateRaw    = row['STATE'] || null;
            const typeRaw     = row['TYPE'] || null;
            const kwhThresh   = parseDecimal(row['KWH THERSHOLD'] ?? row['KWH THRESHOLD']);
            const rateUnder   = parseDecimal(row['MONTHLY FLAT RATE UNDER KWH']);
            const rateOver    = parseDecimal(row['MONTHLY FLAT RATE OVER KWH']);
            const termRaw     = row['TERM LENGTH'];

            if (!utility) continue;

            const attributes = {};
            if (kwhThresh  !== null) attributes.kwh_threshold           = kwhThresh;
            if (rateOver   !== null) attributes.rate_over_kwh_threshold = rateOver;

            results.push({
                utility:      String(utility).trim(),
                state:        expandState(stateRaw),
                commodity:    'Electric',
                pricing_type: 'flat_monthly',
                segment:      normalizeSegment(typeRaw),
                unit:         'kWh',
                rate_value:   rateUnder,
                ptc:          null,
                term:         normalizeTerm(termRaw),
                cancellation: null,
                attributes:   Object.keys(attributes).length > 0 ? attributes : null,
            });
        }

        console.log(`[CinchParser] Parsed ${results.length} rows from CINCH sheet`);
        return results;
    }
}

module.exports = CinchParser;
