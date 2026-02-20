const xlsx = require('xlsx');

class ExcelService {

    /**
     * Parse Excel buffer and return raw data + metadata
     * @param {Buffer} fileBuffer 
     */
    static parseBuffer(fileBuffer) {
        const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Raw JSON
        const results = xlsx.utils.sheet_to_json(sheet);

        // Extract headers from first row if exists
        let headers = [];
        if (results.length > 0) {
            headers = Object.keys(results[0]);
        }

        return {
            sheets: workbook.SheetNames,
            headers,
            results
        };
    }

    /**
     * Legacy parseRates for direct insertion (if still used)
     */
    static parseRates(fileBuffer, { provider_id, commodity_type = 'ELECTRIC' }) {
        const data = this.parseBuffer(fileBuffer);
        return data.results.map(row => this.normalizeRow(row, provider_id, commodity_type));
    }

    static normalizeRow(row, providerId, commodityType) {
        // ... (Keep existing logic or improve)
        // For now, let's keep the core logic
        const getVal = (keyPart) => {
            const key = Object.keys(row).find(k => k.toLowerCase().includes(keyPart.toLowerCase()));
            return key ? row[key] : null;
        };
        let rawRate = getVal('rate') || getVal('price');
        let rawTerm = getVal('term') || getVal('duration');
        let rawUtility = getVal('utility') || getVal('ldc');
        let finalRate = null;
        let displayPrice = null;

        if (typeof rawRate === 'number') {
            finalRate = (commodityType === 'ELECTRIC' && rawRate > 5) ? rawRate / 100 : rawRate;
        } else {
            displayPrice = rawRate;
        }

        const attributes = { ...row };
        const coreKeys = ['rate', 'price', 'term', 'duration', 'utility', 'ldc'];
        Object.keys(row).forEach(k => {
            if (coreKeys.some(ck => k.toLowerCase().includes(ck))) delete attributes[k];
        });
        if (displayPrice) attributes.display_price = displayPrice;

        return {
            provider_id: providerId,
            utility_id: null, // Will be resolved by UploadController
            commodity: commodityType,
            rate_value: finalRate,
            term: typeof rawTerm === 'number' ? rawTerm : parseInt(rawTerm) || 0,
            attributes: attributes,
            raw_utility_name: rawUtility
        };
    }
}

module.exports = ExcelService;
