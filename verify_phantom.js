const axios = require('axios');

const RATES_URL = 'http://localhost:4002/graphql'; // Direct

async function run() {
    console.log('👻 Verifying Phantom Rates directly against Rates Service...');

    // Bypass Login, inject headers simulating Gateway
    const headers = {
        'x-user-role': 'AGENT',
        'x-user-id': '1', // Agent ID
        'Content-Type': 'application/json'
    };

    try {
        // Query utility 999 (Mock Utility where APGE is active but has no rates)
        // Rate has is_placeholder field now
        const ratesQuery = `
            query {
                getRates(utilityId: "999", state: "NY") {
                    id
                    provider { id }
                    rate_value
                    is_placeholder
                    attributes
                }
            }
        `;

        const ratesRes = await axios.post(RATES_URL,
            { query: ratesQuery },
            { headers: headers }
        );

        if (ratesRes.data.errors) {
            console.error('❌ Query Error:', JSON.stringify(ratesRes.data.errors, null, 2));
            return;
        }

        const rates = ratesRes.data.data.getRates;
        const phantom = rates.find(r => r.is_placeholder === true);

        if (phantom) {
            console.log('✅ Phantom Rate Found:', phantom);
            if (phantom.provider.id === "1") {
                console.log('✅ Changes Verified for Provider 1 (APGE).');
            } else {
                console.log('⚠️ Phantom found but provider ID differs:', phantom.provider.id);
            }
        } else {
            console.error('❌ No Phantom Rate found. Rates returned:', rates.length);
            console.log(rates);
        }

    } catch (error) {
        console.error('❌ Request failed:', error);
        if (error.response) console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
    }
}

run();
