const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

const GATEWAY_URL = 'http://localhost:4000/graphql';
const UPLOAD_SERVICE_URL = 'http://localhost:4005/upload/rates';
const FILE_PATH = path.join(__dirname, 'services/upload-service/src/test_rates.xlsx');

async function verifyUpload() {
    try {
        // 1. Login to get Token
        console.log('🔑 Logging in...');
        const loginQuery = `
            mutation Login($email: String!, $password: String!) {
                login(email: $email, password: $password) {
                    token
                }
            }
        `;
        const loginResponse = await axios.post(GATEWAY_URL, {
            query: loginQuery,
            variables: { email: 'admin@example.com', password: 'admin123' }
        });

        const token = loginResponse.data.data.login.token;
        if (!token) throw new Error('Login failed, no token.');
        console.log('✅ Token received.');

        // 2. Upload File
        console.log('📤 Uploading file...');
        if (!fs.existsSync(FILE_PATH)) {
            throw new Error(`File not found at ${FILE_PATH}`);
        }

        const form = new FormData();
        form.append('file', fs.createReadStream(FILE_PATH));
        form.append('jsonData', JSON.stringify({
            provider_id: 1, // ConEd from init.sql
            commodity_type: 'ELECTRIC'
        }));

        const uploadResponse = await axios.post(UPLOAD_SERVICE_URL, form, {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${token}`
            }
        });

        console.log('✅ Upload Response:', JSON.stringify(uploadResponse.data, null, 2));

        // 3. Verify Data via Gateway
        console.log('🔍 Verifying Data in Rates Service...');
        const ratesQuery = `
            query GetRates {
                getRates {
                    id
                    Rate
                    duracion_rate
                    attributes
                    provider {
                        id
                    }
                }
            }
        `;
        const ratesResponse = await axios.post(GATEWAY_URL, {
            query: ratesQuery
        }, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const rates = ratesResponse.data.data.getRates;
        console.log(`📦 Retrieved ${rates.length} rates.`);
        if (rates.length > 0) {
            console.log('Sample Rate (First):', JSON.stringify(rates[0], null, 2));
            console.log('Sample Rate (Last):', JSON.stringify(rates[rates.length - 1], null, 2));
        }

    } catch (error) {
        console.error('❌ Error Message:', error.message);
        if (error.response) {
            console.error('Response Status:', error.response.status);
            console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error('No response received via Axios.');
        } else {
            console.error('Stack:', error.stack);
        }
    }
}

verifyUpload();
