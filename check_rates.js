const axios = require('axios');

async function checkRates() {
    try {
        console.log('Querying Rates Service (getRates)...');
        const query = `
  query {
    getRates {
      id
      attributes
    }
  }
`;
        const response = await axios.post('http://localhost:4002/graphql', {
            query: query
        });
        console.log('Response status:', response.status);
        console.log('Data:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
}

checkRates();
