/**
 * ETL Integration Test — test_etl_flow.js
 *
 * Verifica el flujo completo sin Axios inter-servicio:
 *   1. Crea un Excel falso en memoria
 *   2. Lo sube al upload-service (REST, puerto 4005)
 *   3. Conecta al Gateway via WebSocket (puerto 4000)
 *   4. Escucha la suscripción uploadEvent
 *   5. Envía la mutación confirmUpload
 *   6. Imprime todos los eventos que llegan hasta UPLOAD_COMPLETE o timeout
 *
 * Requisitos para ejecutar:
 *   docker-compose up (gateway:4000, upload-service:4005, redis, mysql)
 *
 * Uso:
 *   node test_etl_flow.js
 *   node test_etl_flow.js --provider=1 --timeout=60
 */

'use strict';

const path   = require('path');
const https  = require('https');
const http   = require('http');
const XLSX   = require(path.resolve(__dirname, 'services/upload-service/node_modules/xlsx'));
const WS     = require(path.resolve(__dirname, 'services/graphql-gateway/node_modules/ws'));

// ── Config ────────────────────────────────────────────────────────────────────
const UPLOAD_HOST   = process.env.UPLOAD_HOST   || 'localhost';
const UPLOAD_PORT   = parseInt(process.env.UPLOAD_PORT)   || 4005;
const GATEWAY_HOST  = process.env.GATEWAY_HOST  || 'localhost';
const GATEWAY_PORT  = parseInt(process.env.GATEWAY_PORT)  || 4000;
const JWT_SECRET    = process.env.JWT_SECRET    || 'NwfgMasterSecret2025!!';
const PROVIDER_ID   = parseInt(process.argv.find(a => a.startsWith('--provider='))?.split('=')[1]) || 1;
const TIMEOUT_SEC   = parseInt(process.argv.find(a => a.startsWith('--timeout='))?.split('=')[1])  || 45;

// ── Minimal JWT (HS256) — mirrors the seed user brian id=5 ────────────────────
function buildJWT(secret) {
    const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        id: 5, nombre: 'Brian', username: 'brian', rol: 'admin', centro: 1,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
    })).toString('base64url');

    const crypto = require('crypto');
    const sig = crypto
        .createHmac('sha256', secret)
        .update(`${header}.${payload}`)
        .digest('base64url');
    return `${header}.${payload}.${sig}`;
}

// ── Build mock Excel ──────────────────────────────────────────────────────────
function buildMockExcel() {
    const ws = XLSX.utils.aoa_to_sheet([
        ['Utility',       'Commodity', 'Rate',   'Term', 'Zone'],
        ['Con Edison',    'Electric',  0.0982,   12,     'NY1'],
        ['Con Edison',    'Electric',  0.0955,   24,     'NY1'],
        ['National Grid', 'Electric',  0.1034,   12,     'NY2'],
        ['National Grid', 'Gas',       0.8500,   12,     'NY2'],
        ['Con Edison',    'Gas',       0.9200,   6,      'NY1'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rates');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ── Column mapping for this Excel ─────────────────────────────────────────────
const MAPPING_JSON = JSON.stringify({
    'Utility':   'utility',
    'Commodity': 'commodity',
    'Rate':      'rate',
    'Term':      'term',
    'Zone':      'zone',
});

// ── Multipart file upload (pure Node.js, no external HTTP library) ────────────
function uploadFile(token, fileBuffer) {
    return new Promise((resolve, reject) => {
        const boundary = '----FormBoundary' + Date.now();
        const filename = `test_rates_${Date.now()}.xlsx`;
        const header   = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`;
        const footer   = `\r\n--${boundary}--\r\n`;
        const body     = Buffer.concat([Buffer.from(header), fileBuffer, Buffer.from(footer)]);

        const options = {
            hostname: UPLOAD_HOST,
            port:     UPLOAD_PORT,
            path:     '/api/upload',
            method:   'POST',
            headers: {
                'Content-Type':  `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.length,
                'Authorization':  `Bearer ${token}`,
                'x-user-id':      '5',
            },
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch { reject(new Error(`Upload response parse error: ${data}`)); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ── WebSocket graphql-ws protocol helpers ─────────────────────────────────────
const GQL = {
    CONNECTION_INIT: 'connection_init',
    CONNECTION_ACK:  'connection_ack',
    SUBSCRIBE:       'subscribe',
    NEXT:            'next',
    ERROR:           'error',
    COMPLETE:        'complete',
    PING:            'ping',
    PONG:            'pong',
};

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
    console.log('\n🚀 ETL Integration Test — NWFG\n');

    const token = buildJWT(JWT_SECRET);
    console.log(`🔑 JWT generado para user=brian (id=5)`);

    const excelBuffer = buildMockExcel();
    console.log(`📊 Excel mock creado: 5 filas (Con Edison + National Grid, Gas + Electric)`);

    // Step 1 — Upload file
    console.log(`\n[1/3] Subiendo archivo al upload-service (${UPLOAD_HOST}:${UPLOAD_PORT})...`);
    let uploadResult;
    try {
        uploadResult = await uploadFile(token, excelBuffer);
    } catch (err) {
        console.error('❌ Upload falló:', err.message);
        console.error('   → ¿Está corriendo docker-compose? ¿Puerto 4005 accesible?');
        process.exit(1);
    }

    if (!uploadResult.success) {
        console.error('❌ Upload-service rechazó el archivo:', uploadResult);
        process.exit(1);
    }

    const { sessionId, headers, rowCount } = uploadResult;
    console.log(`✅ sessionId: ${sessionId}`);
    console.log(`   headers detectados: [${headers.join(', ')}]`);
    console.log(`   filas parseadas: ${rowCount}`);

    // Step 2 — Connect to Gateway WS + subscribe to uploadEvent
    console.log(`\n[2/3] Conectando al Gateway WS (${GATEWAY_HOST}:${GATEWAY_PORT})...`);

    await new Promise((resolve, reject) => {
        const ws = new WS(`ws://${GATEWAY_HOST}:${GATEWAY_PORT}/graphql`, ['graphql-transport-ws']);
        let msgId = 0;

        const send = (obj) => ws.send(JSON.stringify(obj));

        const timeout = setTimeout(() => {
            console.error(`\n⏰ Timeout: no llegó UPLOAD_COMPLETE en ${TIMEOUT_SEC}s`);
            ws.close();
            resolve();
        }, TIMEOUT_SEC * 1000);

        ws.on('open', () => {
            console.log('✅ WS conectado');
            send({ type: GQL.CONNECTION_INIT, payload: { Authorization: `Bearer ${token}` } });
        });

        ws.on('message', async (raw) => {
            const msg = JSON.parse(raw.toString());

            if (msg.type === GQL.PING) { send({ type: GQL.PONG }); return; }

            if (msg.type === GQL.CONNECTION_ACK) {
                console.log('✅ Gateway ACK recibido');

                // Subscribe to uploadEvent
                send({
                    id: String(++msgId),
                    type: GQL.SUBSCRIBE,
                    payload: {
                        query: `subscription {
                            uploadEvent {
                                type sessionId userId scope
                                processed total percent
                                dirtyName message rowCount
                            }
                        }`,
                    },
                });
                console.log(`📡 Suscripción uploadEvent registrada (id=${msgId})`);

                // Step 3 — Confirm upload via mutation (also over WS)
                console.log(`\n[3/3] Enviando mutación confirmUpload (provider=${PROVIDER_ID})...`);
                send({
                    id: String(++msgId),
                    type: GQL.SUBSCRIBE,
                    payload: {
                        query: `mutation {
                            confirmUpload(
                                sessionId: "${sessionId}",
                                providerId: ${PROVIDER_ID},
                                mappingJson: ${JSON.stringify(MAPPING_JSON)}
                            ) {
                                success
                                message
                            }
                        }`,
                    },
                });
            }

            if (msg.type === GQL.NEXT) {
                const data = msg.payload?.data;

                // Mutation response
                if (data?.confirmUpload) {
                    const r = data.confirmUpload;
                    console.log(`\n🔔 confirmUpload → success=${r.success} message="${r.message}"`);
                    if (!r.success) {
                        console.error('❌ Gateway rechazó la confirmación. ¿Sesión expirada?');
                        clearTimeout(timeout); ws.close(); resolve(); return;
                    }
                    console.log('   ETL_START publicado. Esperando eventos...\n');
                }

                // Subscription events
                if (data?.uploadEvent) {
                    const e = data.uploadEvent;
                    const shortId = e.sessionId?.slice(-8) || '';

                    switch (e.type) {
                        case 'UPLOAD_STARTED':
                            console.log(`  📤 UPLOAD_STARTED   session=...${shortId}`);
                            break;
                        case 'PARSE_COMPLETE':
                            console.log(`  📋 PARSE_COMPLETE   rows=${e.rowCount}`);
                            break;
                        case 'UPLOAD_PROGRESS':
                            console.log(`  ⚙️  UPLOAD_PROGRESS  ${e.processed}/${e.total} (${e.percent}%)`);
                            break;
                        case 'AWAITING_USER':
                            console.warn(`  ⚠️  AWAITING_USER    dirtyName="${e.dirtyName}"`);
                            console.warn(`     → Agrega el alias en rates-service y reintenta.`);
                            clearTimeout(timeout); ws.close(); resolve(); return;
                        case 'UPLOAD_COMPLETE':
                            console.log(`\n  ✅ UPLOAD_COMPLETE  total=${e.total} provider=${PROVIDER_ID}`);
                            console.log('\n🎉 Flujo completo confirmado. El ETL está cableado correctamente.\n');
                            clearTimeout(timeout); ws.close(); resolve(); return;
                        default:
                            console.log(`  ℹ️  ${e.type}`);
                    }
                }
            }

            if (msg.type === GQL.ERROR) {
                console.error('❌ Error GraphQL:', JSON.stringify(msg.payload));
            }
        });

        ws.on('error', (err) => {
            console.error('❌ WS error:', err.message);
            clearTimeout(timeout); reject(err);
        });

        ws.on('close', () => {
            clearTimeout(timeout); resolve();
        });
    });
}

run().catch(err => {
    console.error('❌ Error inesperado:', err);
    process.exit(1);
});
