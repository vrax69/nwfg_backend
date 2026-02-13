const ExcelService = require('../services/excel.service');
const axios = require('axios');
require('dotenv').config();

const RATES_SERVICE_URL = process.env.RATES_SERVICE_URL || 'http://rates-service:4002';

const uploadRates = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        // 1. Metadata
        // Expected: jsonData = { provider_id: 1, commodity_type: 'ELECTRIC' }
        const metadata = req.body.jsonData ? JSON.parse(req.body.jsonData) : {};
        const { provider_id, commodity_type = 'ELECTRIC' } = metadata;

        if (!provider_id) {
            return res.status(400).json({ success: false, message: 'provider_id is required in jsonData' });
        }

        console.log(`🚀 Uploading for Provider: ${provider_id}, Commodity: ${commodity_type}`);

        // 2. Parse & Normalize with ExcelService
        const processedRates = ExcelService.parseRates(req.file.buffer, {
            provider_id: parseInt(provider_id),
            commodity_type
        });

        console.log(`📦 Processed ${processedRates.length} rates.`);
        // console.log('Sample:', processedRates[0]);

        // 3. Send to Rates Service
        // Note: Rates Service bulkInsert needs to handle the new structure (attributes, etc.)
        const token = req.headers['authorization'];

        const response = await axios.post(`${RATES_SERVICE_URL}/rates/bulk`, {
            provider_id: parseInt(provider_id), // Scope for deletion
            rates: processedRates
        }, {
            headers: { 'Authorization': token }
        });

        return res.status(response.status).json(response.data);

    } catch (error) {
        console.error('❌ Error en Upload Service:', error.message);
        const status = error.response ? error.response.status : 500;
        const message = error.response ? error.response.data : ('Internal Error: ' + error.message);
        return res.status(status).json(message);
    }
};

module.exports = {
    uploadRates
};
