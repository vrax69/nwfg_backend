const xlsx = require('xlsx');

class ExcelService {
    /**
     * Parse Excel file and normalize data
     * @param {Buffer} fileBuffer 
     * @param {Object} options { provider_id, commodity_type, mapping }
     */
    static parseRates(fileBuffer, { provider_id, commodity_type = 'ELECTRIC' }) {
        const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // 1. Convert to JSON (Header: 1 to get raw arrays first to find headers? No, lets trust standard json)
        // Using default sheet_to_json behavior (first row as header)
        const rawRows = xlsx.utils.sheet_to_json(sheet);

        console.log(`ExcelService: Parsed ${rawRows.length} rows.`);

        return rawRows.map(row => this.normalizeRow(row, provider_id, commodity_type));
    }

    static normalizeRow(row, providerId, commodityType) {
        // 2. Identification of Core Columns (Case insensitive lookup helper)
        const getVal = (keyPart) => {
            const key = Object.keys(row).find(k => k.toLowerCase().includes(keyPart.toLowerCase()));
            return key ? row[key] : null;
        };

        // Mapping based on "CleanSky" example / Standard Columns
        // Core: Rate, Term, Utility
        let rawRate = getVal('rate') || getVal('price');
        let rawTerm = getVal('term') || getVal('duration');
        let rawUtility = getVal('utility') || getVal('ldc');

        // 3. Context-Aware Pricing
        let finalRate = null;
        let displayPrice = null;

        if (typeof rawRate === 'number') {
            if (commodityType === 'ELECTRIC') {
                // Logic: If > 5, assume cents -> convert to dollars
                finalRate = rawRate > 5 ? rawRate / 100 : rawRate;
            } else {
                // GAS: Use as is
                finalRate = rawRate;
            }
        } else {
            // It's a string/text
            finalRate = null; // Core rate must be numeric for sorting/filtering
            displayPrice = rawRate; // "Call for Quote", "Market", etc.
        }

        // 4. Attributes JSON Construction
        // Everything that is NOT core goes here.
        const attributes = { ...row };

        // Cleanup core fields from attributes to avoid duplication? 
        // Maybe keep them for traceability, but requested "TODO LO DEMAS" implies separation.
        // Let's remove keys that we identified as core.
        const coreKeys = Object.keys(row).filter(k =>
            k.toLowerCase().includes('rate') ||
            k.toLowerCase().includes('price') ||
            k.toLowerCase().includes('term') ||
            k.toLowerCase().includes('duration') ||
            k.toLowerCase().includes('utility') ||
            k.toLowerCase().includes('ldc')
        );
        coreKeys.forEach(k => delete attributes[k]);

        // Add derived/extra info to attributes
        if (displayPrice) attributes.display_price = displayPrice;

        // 5. Construct Final Object
        return {
            provider_id: providerId,
            utility_id: null, // Resolving Utility ID is a separate complex step. For now sending null or mocked. 
            // In a real scenario, we'd look up `rawUtility` against `utilities` table aliases.
            // For this MVP, we assume the backend might try to map it or we enter it mapping step.
            // Let's pass the raw utility name in attributes or a temporary field for now.
            commodity: commodityType,
            rate_value: finalRate,
            term: typeof rawTerm === 'number' ? rawTerm : parseInt(rawTerm) || 0,
            attributes: attributes, // Dynamic JSON
            // Utilities mapping is tricky without DB access here. 
            // passing raw_utility_name for RatesService to handle or logging it.
            raw_utility_name: rawUtility
        };
    }
}

module.exports = ExcelService;
