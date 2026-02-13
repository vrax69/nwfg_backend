const axios = require('axios');

const GATEWAY_URL = 'http://localhost:4000/graphql';

async function verifyAdvancedQueries() {
    try {
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

        if (loginResponse.data.errors) {
            throw new Error(JSON.stringify(loginResponse.data.errors));
        }

        const token = loginResponse.data.data.login.token;
        console.log('✅ Token received.');

        const headers = { Authorization: `Bearer ${token}` };

        console.log('🔍 Testing getMarketStructure...');
        const structureQuery = `
            query GetStructure {
                getMarketStructure {
                    code
                    utilities {
                        name
                        serviceType
                        rateCount
                    }
                }
            }
        `;
        const structResponse = await axios.post(GATEWAY_URL, { query: structureQuery }, { headers });

        if (structResponse.data.errors) {
            console.error('Structure Errors:', JSON.stringify(structResponse.data.errors));
        }

        const states = structResponse.data.data.getMarketStructure || [];

        console.log(`✅ Market Structure: Found ${states.length} states.`);
        if (states.length > 0) {
            console.log('Sample State:', JSON.stringify(states[0], null, 2));
        }

        console.log('\n🔍 Testing getRates with Filter (State: DE)...');
        const filterQuery = `
            query GetRatesFiltered($state: String) {
                getRates(state: $state) {
                    id
                    Rate
                    attributes
                }
            }
        `;
        const filterResponse = await axios.post(GATEWAY_URL, {
            query: filterQuery,
            variables: { state: 'DE' }
        }, { headers });

        if (filterResponse.data.errors) {
            console.error('Filter Errors:', JSON.stringify(filterResponse.data.errors));
        }

        const rates = filterResponse.data.data.getRates || [];
        console.log(`✅ Filtered Rates (DE): Found ${rates.length} rates.`);
        if (rates.length > 0) {
            const firstAttr = rates[0].attributes;
            console.log(`   First Rate State: ${firstAttr?.State || 'N/A'}`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

verifyAdvancedQueries();
