const axios = require('axios');

const GATEWAY_URL = 'http://localhost:4000/graphql';

async function login(email, password) {
    const loginQuery = `
        mutation Login($email: String!, $password: String!) {
            login(email: $email, password: $password) {
                token
                user {
                    role
                }
            }
        }
    `;

    try {
        const response = await axios.post(GATEWAY_URL, {
            query: loginQuery,
            variables: { email, password }
        });

        if (response.data.errors) {
            throw new Error(JSON.stringify(response.data.errors));
        }
        return response.data.data.login;
    } catch (e) {
        console.error(`❌ Login failed for ${email}:`, e.message);
        return null;
    }
}

async function getStats(token, roleName) {
    const query = `
        query GetStructure {
            getMarketStructure {
                code
                utilities {
                    name
                    rateCount
                }
            }
        }
    `;

    try {
        const response = await axios.post(GATEWAY_URL, { query }, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (response.data.errors) {
            console.error(`❌ Error fetching stats for ${roleName}:`, JSON.stringify(response.data.errors));
            return 0;
        }

        const states = response.data.data.getMarketStructure;
        let totalRates = 0;
        states.forEach(s => {
            s.utilities.forEach(u => totalRates += u.rateCount);
        });

        console.log(`📊 [${roleName}] Total Rate Count Visible: ${totalRates}`);
        return totalRates;
    } catch (e) {
        console.error(`❌ Query failed for ${roleName}:`, e.message);
        return 0;
    }
}

async function verifyRBAC() {
    console.log('🔒 Verifying RBAC...');

    // 1. Admin Login
    const adminAuth = await login('admin@example.com', 'admin123');
    if (adminAuth) {
        console.log(`✅ Admin logged in. Role: ${adminAuth.user.role}`);
        const adminCount = await getStats(adminAuth.token, 'ADMIN');

        // 2. Agent Login
        const agentAuth = await login('agent@example.com', 'agent123');
        if (agentAuth) {
            console.log(`✅ Agent logged in. Role: ${agentAuth.user.role}`);
            const agentCount = await getStats(agentAuth.token, 'AGENT');

            // 3. Compare
            if (adminCount > agentCount) {
                console.log(`✅ SUCCESS: Admin sees more rates (${adminCount}) than Agent (${agentCount}). Draft filtering works!`);
            } else if (adminCount === agentCount) {
                console.log(`⚠️ WARNING: Admin and Agent see same count (${adminCount}). Check if any drafts exist.`);
            } else {
                console.log(`❌ FAILURE: Agent sees more rates? Impossible.`);
            }
        }
    }
}

verifyRBAC();
