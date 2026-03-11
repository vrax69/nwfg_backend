const express = require('express');
const cors = require('cors');
require('dotenv').config();
const uploadRoutes = require('./src/routes/upload.routes');

const app = express();
const port = process.env.PORT || 4005;

// CORS: exact origins only — wildcard (*) is forbidden when credentials: 'include' is used
const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'https://nwfg.net',
    'https://www.nwfg.net',
    'https://test.nwfg.net',
];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g. curl, Postman, server-side)
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS: Origin ${origin} not allowed`));
        }
    },
    credentials: true,   // Required: allows browser to send HttpOnly cookies
}));

app.use(express.json());

// Route prefix matches Nginx proxy: location /api/upload/ → upload-service
app.use('/api/upload', uploadRoutes);

app.listen(port, () => {
    console.log(`🚀 Upload Service en puerto ${port} | CORS: ${ALLOWED_ORIGINS.join(', ')}`);
});