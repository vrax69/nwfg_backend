// Canonical key dictionary — ADR-005
// These are the ONLY values the FE sends in mappingJson.
// The worker maps each canonical key to its DB column in buildRateObject.
//
// FE: mappingJson = JSON.stringify({ "ProductID": "external_id", "Rate": "rate_value", ... })

const CANONICAL = {
  // ── Identifiers ──────────────────────────────────────────────────────────
  EXTERNAL_ID:      'external_id',       // → rates.external_id
  COMPANY_DBA_NAME: 'company_dba_name',  // → rates.company_dba_name
  PRODUCT:          'product',           // → rates.product

  // ── Utility resolution ───────────────────────────────────────────────────
  UTILITY:          'utility',           // → utility_id (resolved via aliases)

  // ── Geography ────────────────────────────────────────────────────────────
  STATE:            'state',             // → rates.state
  ZONE:             'zone',              // → attributes.zone (no dedicated column)

  // ── Energy basics ────────────────────────────────────────────────────────
  COMMODITY:        'commodity',         // → rates.commodity ENUM('Gas','Electric')
  UNIT:             'unit',              // → rates.unit
  PRICING_TYPE:     'pricing_type',      // → rates.pricing_type (Fixed/Variable)
  SEGMENT:          'segment',           // → rates.segment (Residential/Commercial)

  // ── Pricing ──────────────────────────────────────────────────────────────
  RATE_VALUE:       'rate_value',        // → rates.rate_value DECIMAL(10,4)
  PTC:              'ptc',               // → rates.ptc DECIMAL(10,6)
  MSF:              'msf',              // → rates.msf DECIMAL(10,2)
  TERM:             'term',              // → rates.term INT (months)

  // ── Fees & extras ────────────────────────────────────────────────────────
  CANCELLATION:     'cancellation',      // → rates.cancellation (ETF description)
  MARGIN:           'margin',            // → attributes.margin
  INCENTIVE:        'incentive',         // → attributes.incentive
  PROGRAM_CODE:     'program_code',      // → attributes.program_code
};

// Canonical keys that resolve to utility_id
const UTILITY_KEYS = [CANONICAL.UTILITY];

// Canonical keys that map to rate_value
const RATE_KEYS = [CANONICAL.RATE_VALUE];

// Canonical keys that map to term
const TERM_KEYS = [CANONICAL.TERM];

// All keys that get their own DB column (stripped from attributes JSON)
const CORE_KEYS = [
  CANONICAL.EXTERNAL_ID,
  CANONICAL.COMPANY_DBA_NAME,
  CANONICAL.PRODUCT,
  CANONICAL.UTILITY,
  CANONICAL.STATE,
  CANONICAL.COMMODITY,
  CANONICAL.UNIT,
  CANONICAL.PRICING_TYPE,
  CANONICAL.SEGMENT,
  CANONICAL.RATE_VALUE,
  CANONICAL.PTC,
  CANONICAL.MSF,
  CANONICAL.TERM,
  CANONICAL.CANCELLATION,
];

module.exports = { CANONICAL, UTILITY_KEYS, RATE_KEYS, TERM_KEYS, CORE_KEYS };
