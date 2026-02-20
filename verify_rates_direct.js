const axios = require('axios');

const RATES_URL = 'http://localhost:4002/graphql';

async function verifyDirect() {
    console.log(`🔌 Checking Rates Service directly at ${RATES_URL}...`);

    // Introspection query
    const query = `
        query {
            _service {
                sdl
            }
        }
    `;

    try {
        const res = await axios.post(RATES_URL, { query });
        if (res.data.errors) {
            console.error('❌ Rates Service Error:', JSON.stringify(res.data.errors, null, 2));
        } else {
            console.log('✅ Rates Service is UP and responding to introspection.');
            console.log('SDL length:', res.data.data._service.sdl.length);
        }
    } catch (error) {
        console.error('❌ Connection Failed:', error.message);
        if (error.response) console.error('Response:', error.response.status, error.response.statusText);
    }
}

verifyDirect();
