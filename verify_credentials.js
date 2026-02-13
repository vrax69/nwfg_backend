const axios = require('axios');

const GATEWAY_URL = 'http://localhost:4000/graphql';

async function login(email, password) {
    const loginQuery = `
    mutation {
        login(email: "${email}", password: "${password}") {
            token
            user {
                id
                email
                role
            }
        }
    }`;

    try {
        const response = await axios.post(GATEWAY_URL, { query: loginQuery });
        if (response.data.errors) {
            console.error(`❌ Login failed for ${email}:`, JSON.stringify(response.data.errors, null, 2));
            return null;
        }
        return response.data.data.login.token;
    } catch (error) {
        console.error(`❌ Login request error for ${email}:`, error.message);
        return null;
    }
}

async function verifyCredentials(token) {
    const providerId = 1;
    const portalUser = "test_agent_user";
    const portalPass = "test_agent_pass";
    const tpvId = "TPV-999";

    // 1. Update Credentials
    console.log('🔄 Updating Credentials...');
    const updateMutation = `
    mutation {
        updateProviderCredential(
            providerId: ${providerId}, 
            portalUser: "${portalUser}", 
            portalPass: "${portalPass}", 
            tpvId: "${tpvId}"
        ) {
            id
            email
        }
    }`;

    try {
        const updateRes = await axios.post(GATEWAY_URL,
            { query: updateMutation },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        if (updateRes.data.errors) {
            console.error('❌ Update Mutation Failed:', JSON.stringify(updateRes.data.errors, null, 2));
            return false;
        }
        console.log('✅ Mutation executed successfully.');
    } catch (error) {
        console.error('❌ Update request error:', error.message);
        return false;
    }

    // 2. Query Credentials (me)
    console.log('🔄 Querying Credentials...');
    const meQuery = `
    query {
        me {
            id
            email
            credentials {
                provider_id
                portal_username
                portal_password
                tpv_id
            }
        }
    }`;

    try {
        const meRes = await axios.post(GATEWAY_URL,
            { query: meQuery },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        if (meRes.data.errors) {
            console.error('❌ Me Query Failed:', JSON.stringify(meRes.data.errors, null, 2));
            return false;
        }

        const creds = meRes.data.data.me.credentials;
        const target = creds.find(c => c.provider_id === providerId);

        if (!target) {
            console.error('❌ Credential not found in list.');
            return false;
        }

        if (target.portal_username === portalUser && target.tpv_id === tpvId) {
            console.log('✅ Credentials Verification SUCCESS!');
            console.log('   Retrieved:', target);
            return true;
        } else {
            console.error('❌ Mismatch in retrieved data:', target);
            return false;
        }
    } catch (error) {
        console.error('❌ Query request error:', error.message);
        return false;
    }
}

async function run() {
    console.log('🔒 Verifying Agent Credentials...');

    // Use Agent Credentials (created in previous step)
    const token = await login('agent@example.com', 'agent123');
    if (!token) process.exit(1);

    const success = await verifyCredentials(token);
    if (!success) process.exit(1);

    process.exit(0);
}

run();
