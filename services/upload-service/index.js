const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 4005;
const RATES_SERVICE_URL = process.env.RATES_SERVICE_URL || 'http://rates-service:4002';

app.use(cors());
app.use(express.json());

// Configuración de Multer para recibir archivos en memoria
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

/**
 * Endpoint para subir Excel y enviar a Rates Service
 * Espera un campo "file" y un campo "jsonData" con el mapping y provider_id
 */
app.post('/upload/rates', upload.single('file'), async (req, res) => {
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
        const response = await axios.post(`${RATES_SERVICE_URL}/rates/bulk`, {
            provider_id,
            mapping,
            rates: rawData
        });

        // 4. Retornar la respuesta del Rates Service al cliente (Yaak/Frontend)
        return res.status(response.status).json(response.data);

    } catch (error) {
        console.error('❌ Error en Upload Service:', error.message);
        const status = error.response ? error.response.status : 500;
        const message = error.response ? error.response.data : 'Internal Server Error';
        return res.status(status).json(message);
    }
});

app.listen(port, () => {
    console.log(`🚀 Upload Service listo en el puerto ${port}`);
});