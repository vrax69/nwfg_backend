const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');
const Redis = require('ioredis');

const UPLOAD_URL = 'http://localhost:4005/upload';
const REDIS_PORT = 6379;

async function verifyETL() {
    console.log('🚀 Verifying ETL Flow (Upload -> Events -> Alias Resolution)...');

    // 1. Setup Redis Subscriber
    const sub = new Redis({ port: REDIS_PORT });
    await sub.subscribe('UPLOAD_EVENTS');

    sub.on('message', (channel, message) => {
        const event = JSON.parse(message);
        console.log(`📡 [Redis Event] ${event.type}:`, event);
        if (event.type === 'MISSING_ALIAS') {
            console.log(`⚠️ MISSING ALIAS DETECTED: ${event.dirtyName}`);
            // Here we would call resolveAlias automatically to test the loops
            // But for now, we just want to see the event.
        }
    });

    // 2. Create Dummy Excel (or use existing if possible, but let's mock the upload call)
    // Actually, simple upload test:
    // We need a file. Let's create a textual .xlsx if we can or use a mock.
    // Or we can construct a FormData with a Buffer directly.

    const form = new FormData();
    // Simulate a simple CSV content as a file named test.xlsx (Upload Service parses buffer via xlsx, which handles CSV too)
    const csvContent = "Utility,Rate,Term,State\nBadUtility,0.08,12,NY\nConEd,0.09,12,NY";
    form.append('file', Buffer.from(csvContent), { filename: 'test.csv', contentType: 'text/csv' });

    try {
        console.log('📂 Uploading file...');
        const res = await axios.post(UPLOAD_URL, form, {
            headers: form.getHeaders()
        });

        if (res.data.success) {
            const sessionId = res.data.sessionId;
            console.log(`✅ Upload Success. Session: ${sessionId}`);

            // 3. Confirm Upload
            console.log('🔄 Confirming Upload...');
            await axios.post(`${UPLOAD_URL}/confirm`, {
                sessionId,
                providerId: 1,
                mapping: {} // Default
            });
            console.log('✅ Confirmation sent. Waiting for events...');

            // Wait a bit for events to flow
            await new Promise(r => setTimeout(r, 2000));

            // 4. Resolve Alias (if blocked)
            // We expect to see MISSING_ALIAS event in logs.
            // Let's programmatically resolve 'BadUtility' -> Utility ID 1 (ConEd - just for test)
            console.log('🔧 Resolving Alias: BadUtility -> 1');
            const RATES_URL = 'http://localhost:4002/utilities/alias';
            // We access Rates Service via Gateway or Direct? 
            // Script runs on host, can access 4002 directly if mapped. Yes.

            await axios.post(RATES_URL, {
                dirtyName: 'BadUtility',
                utilityId: 1, // ConEd ID (assuming exists or used generic)
                sessionId
            });
            console.log('✅ Alias Resolved.');

            // 5. Resume (Call confirm again)
            console.log('🔄 Resuming Upload (Re-confirming)...');
            await axios.post(`${UPLOAD_URL}/confirm`, {
                sessionId,
                providerId: 1,
                mapping: {}
            });

            // Wait for completion
            await new Promise(r => setTimeout(r, 5000));
            console.log('✅ Cycle Complete.');

        } else {
            console.error('❌ Upload Failed:', res.data);
        }

    } catch (e) {
        console.error('❌ Error:', e.message);
        if (e.response) console.error(e.response.data);
    }

    sub.disconnect();
}

verifyETL();
