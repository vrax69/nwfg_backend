// app.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');


// Load env variables
dotenv.config();

// Middleware
const auth = require('./src/middleware/auth.middleware');

// Routes
const healthRoutes = require('./src/routes/health.routes');
const utilitiesRoutes = require('./src/routes/utilities.routes');
const identifiersRoutes = require('./src/routes/identifiers.routes');

const app = express();

app.use(cors());
app.use(express.json());

// Public routes (no authentication required)
app.use('/health', healthRoutes);

// Global auth middleware - todas las rutas desde aquí requieren autenticación
app.use(auth(true));

// Protected routes (authentication required)
app.use('/utilities', utilitiesRoutes);
app.use('/identifiers', identifiersRoutes);


// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Not Found' });
});

module.exports = app;
