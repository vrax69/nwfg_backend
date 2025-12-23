const xlsx = require('xlsx');
const axios = require('axios');
require('dotenv').config();

const RATES_SERVICE_URL = process.env.RATES_SERVICE_URL || 'http://rates-service:4002';

const uploadRates = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        // 1. Extraer los metadatos (provider_id y mapping) enviados junto al archivo
        // Nota: En Multer, los campos de texto vienen en req.body
        const metadata = req.body.jsonData ? JSON.parse(req.body.jsonData) : {};
        const { provider_id, mapping } = metadata;

        if (!provider_id || !mapping) {
            return res.status(400).json({ success: false, message: 'provider_id and mapping are required in jsonData' });
        }

        // 2. Parsear el Excel desde el buffer de memoria
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0]; // Tomamos la primera hoja
        const sheet = workbook.Sheets[sheetName];

        // Convertir a JSON plano
        const rawData = xlsx.utils.sheet_to_json(sheet);

        console.log(`📦 Archivo parseado: ${rawData.length} filas detectadas.`);

        // 3. Enviar los datos al Rates Service
        const token = req.headers['authorization'];

        const response = await axios.post(`${RATES_SERVICE_URL}/rates/bulk`, {
            provider_id,
            mapping,
            rates: rawData
        }, {
            headers: {
                'Authorization': token
            }
        });

        // 4. Retornar la respuesta del Rates Service al cliente (Yaak/Frontend)
        return res.status(response.status).json(response.data);

    } catch (error) {
        console.error('❌ Error en Upload Service:', error.message);
        const status = error.response ? error.response.status : 500;
        const message = error.response ? error.response.data : 'Internal Server Error';
        return res.status(status).json(message);
    }
};

module.exports = {
    uploadRates
};
