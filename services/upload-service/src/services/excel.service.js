const xlsx = require('xlsx');

class ExcelService {

    /**
     * Parse Excel buffer and return extracted blocks via Anchor Detection
     * @param {Buffer} fileBuffer 
     */
    static parseBuffer(fileBuffer) {
        const workbook = xlsx.read(fileBuffer, { type: 'buffer' });

        const anchorDict = [
            'gas utility', 'electric utility', 'intro period', 'full term length',
            'utility gas rate', 'utility electric rate', '% of savings', 'intro rate',
            'initial rate', 'etf per remaining month', 'initial length',
            'secondary rate', 'secondary length'
        ];

        const cleanStr = (str) => {
            if (str === null || str === undefined) return '';
            return str.toString().toLowerCase().replace(/[\*\n]/g, ' ').replace(/\s+/g, ' ').trim();
        };

        let allResults = [];
        let allHeaders = new Set();

        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });

            let inBlock = false;
            let currentHeaders = [];

            for (let i = 0; i < rawRows.length; i++) {
                const row = rawRows[i];
                const isEmpty = row.every(cell => cell === null || cell === undefined || cell.toString().trim() === '');

                if (inBlock) {
                    if (isEmpty) {
                        inBlock = false; // Cortar el bloque de datos   
                        continue;
                    }

                    const rowData = {};
                    row.forEach((cell, idx) => {
                        if (idx < currentHeaders.length && currentHeaders[idx]) {
                            rowData[currentHeaders[idx]] = cell !== null ? cell : '';
                        }
                    });

                    const hasData = Object.values(rowData).some(val => val !== '');
                    if (hasData) {
                        allResults.push(rowData);
                    }
                } else {
                    if (isEmpty) continue;

                    // Match against dictionary
                    let matchCount = 0;
                    const rowCleaned = row.map(cleanStr);

                    for (const cell of rowCleaned) {
                        if (cell && anchorDict.some(anchor => cell.includes(anchor))) {
                            matchCount++;
                        }
                    }

                    if (matchCount >= 3) { // Regla: Al menos 3 coincidencias -> headerRow
                        inBlock = true;
                        currentHeaders = row.map(c => c !== null ? c.toString().trim().replace(/\n/g, ' ') : '');
                        currentHeaders.forEach(h => { if (h) allHeaders.add(h); });
                    }
                }
            }
        }

        return {
            sheets: workbook.SheetNames,
            headers: Array.from(allHeaders),
            results: allResults
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
