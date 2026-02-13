const { createClient } = require('graphql-ws');
const WebSocket = require('ws');
const axios = require('axios');

const GATEWAY_WS_URL = 'ws://localhost:4000/graphql';
const RATES_REST_URL = 'http://localhost:4002/rates/bulk';

async function verify() {
    console.log('🔌 Connecting to WebSocket...');

    return new Promise((resolve, reject) => {
        const client = createClient({
            url: GATEWAY_WS_URL,
            webSocketImpl: WebSocket,
        });

        const timer = setTimeout(() => {
            console.error('❌ Timeout: No message received in 10s');
            process.exit(1);
        }, 10000);

        console.log('👂 Subscribing to ratesUpdated...');

        client.subscribe(
            {
                query: `
                    subscription {
                        ratesUpdated {
                            provider_id
                            count
                            timestamp
                        }
                    }
                `,
            },
            {
                next: (data) => {
                    console.log('✅ Received Subscription Data:', JSON.stringify(data));
                    clearTimeout(timer);
                    process.exit(0);
                },
                error: (err) => {
                    console.error('❌ Subscription Error:', err);
                    clearTimeout(timer);
                    process.exit(1);
                },
                complete: () => {
                    console.log('ℹ️ Subscription Complete');
                },
            }
        );

        // Wait a bit for connection to be established
        setTimeout(async () => {
            console.log('🚀 Triggering Bulk Upload via REST...');
            try {
                await axios.post(RATES_REST_URL, {
                    providerId: 999,
                    rates: [
                        {
                            utility_id: 1,
                            commodity: 'electric',
                            rate_value: 0.123,
                            term: 24,
                            attributes: { State: 'NY', Note: 'RealTime Test' }
                        }
                    ]
                });
                console.log('✅ Upload Triggered. Waiting for notification...');
            } catch (e) {
                console.error('❌ Upload Failed:', e.message);
                if (e.response) console.error(e.response.data);
            }
        }, 2000);
    });
}

verify();
