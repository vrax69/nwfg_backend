const express = require('express');
const cors = require('cors');
require('dotenv').config();

// ── Boot BullMQ workers + Redis event subscriber ─────────────────────────────
require('./src/workers/audit.worker');
require('./src/workers/process.worker');
require('./src/events/etl.subscriber'); // ETL_START → enqueue process job

// ── Bull Board UI ─────────────────────────────────────────────────────────────
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const { auditQueue, processQueue } = require('./src/queues/etl.queues');

const boardAdapter = new ExpressAdapter();
boardAdapter.setBasePath('/admin/queues');
createBullBoard({
    queues: [
        new BullMQAdapter(auditQueue),
        new BullMQAdapter(processQueue),
    ],
    serverAdapter: boardAdapter,
});

// ── Express app ───────────────────────────────────────────────────────────────
const uploadRoutes = require('./src/routes/upload.routes');
const app = express();
const port = process.env.PORT || 4005;

const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'https://nwfg.net',
    'https://www.nwfg.net',
    'https://test.nwfg.net',
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS: Origin ${origin} not allowed`));
        }
    },
    credentials: true,
}));

app.use(express.json());

// Log every incoming request — remove after debugging
app.use((req, _res, next) => {
    console.log(`[HTTP] ${req.method} ${req.path} origin=${req.headers.origin ?? 'none'}`);
    next();
});

// Queue monitoring UI — accessible at http://localhost:4005/admin/queues
app.use('/admin/queues', boardAdapter.getRouter());

// ETL routes
app.use('/api/upload', uploadRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'upload-service' }));

app.listen(port, () => {
    console.log(`🚀 Upload Service on port ${port}`);
    console.log(`📊 Bull Board → http://localhost:${port}/admin/queues`);
});
