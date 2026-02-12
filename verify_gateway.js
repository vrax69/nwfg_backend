const axios = require('axios');

const gatewayUrl = 'http://localhost:4000/graphql';

async function runGqlQuery(url, query, variables = {}, headers = {}) {
  try {
    const response = await axios.post(url, {
      query,
      variables
    }, { headers });

    if (response.data.errors) {
      console.error('Query Failed:', JSON.stringify(response.data.errors, null, 2));
      throw new Error(`GraphQL Error: ${response.data.errors[0].message}`);
    }
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('HTTP Error:', error.response.status, error.response.statusText);
      console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Network Error:', error.message);
    }
    throw error;
  }
}

async function checkService(name, url, query) {
  try {
    console.log(`Checking ${name} at ${url}...`);
    const response = await axios.post(url, { query });
    if (response.data.errors) {
      console.error(`${name} returned errors:`, JSON.stringify(response.data.errors));
      return false;
    }
    console.log(`${name} is UP!`);
    return true;
  } catch (error) {
    console.error(`${name} is DOWN:`, error.message);
    return false;
  }
}


async function runVerification() {
  console.log('--- 0. Checking Subgraphs ---');
  // Check Users Service directly
  await checkService('Users Service', 'http://localhost:4001/graphql', 'query { _service { sdl } }');
  // Check Rates Service directly
  await checkService('Rates Service', 'http://localhost:4002/graphql', 'query { _service { sdl } }');

  try {
    // 1. LOGIN
    console.log('\n--- 1. Testing Login (Plain Text) ---');
    const loginData = await runGqlQuery(gatewayUrl, `
            mutation Login($email: String!, $password: String!) {
                login(email: $email, password: $password) {
                    token
                    user {
                        id
                        nombre
                        role
                    }
                }
            }
        `, { email: 'admin@example.com', password: 'admin123' });

    console.log('Login Successful!');
    console.log('Token:', loginData.data.login.token ? 'RECEIVED' : 'MISSING');
    const token = loginData.data.login.token;
    const userId = loginData.data.login.user.id;

    // 2. OWNERSHIP & CONTEXT PROPAGATION
    console.log(`\n--- 2. Testing Ownership (User ID: ${userId}) ---`);
    const profileData = await runGqlQuery(gatewayUrl, `
            query GetProfile($id: ID!) {
                getUserById(id: $id) {
                    id
                    nombre
                    email
                    role
                }
            }
        `, { id: userId }, { Authorization: `Bearer ${token}` });

    console.log('Ownership Verification: SUCCESS');
    console.log('Profile:', profileData.data.getUserById.email);

    // 3. FEDERATION (Provider Entity)
    console.log('\n--- 3. Testing Provider Federation (Rates + Users) ---');
    // We need to fetch rates and see if provider info (from Users) is resolved.
    const ratesData = await runGqlQuery(gatewayUrl, `
            query GetRates {
                getRates {
                    id
                    Rate
                    provider {
                        id
                        nombre
                    }
                }
            }
        `, {}, { Authorization: `Bearer ${token}` });

    console.log('Federation Verification: SUCCESS');
    const rates = ratesData.data.getRates;
    console.log(`Retrieved ${rates.length} rates.`);
    if (rates.length > 0) {
      console.log('First Rate Provider:', rates[0].provider);
      if (rates[0].provider && rates[0].provider.nombre) {
        console.log('Provider Name Resolved: YES');
      } else {
        console.log('Provider Name Resolved: NO (Check Federation)');
      }
    } else {
      console.warn('No rates found to verify federation.');
    }

  } catch (error) {
    console.error('\nVerification Verification FAILED');
    process.exit(1);
  }
}

runVerification();
