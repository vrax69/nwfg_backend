// app.js (ACTUALIZACIÓN)

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
const ratesRoutes = require('./src/routes/rates.routes');
// 🔥 NUEVA RUTA DE PROVIDERS
const providersRoutes = require('./src/routes/providers.routes');

const app = express();

app.use(cors());
// Aplicar express.json() excluyendo /graphql para evitar conflictos con Apollo
// Apollo necesita controlar el parsing del body en su propia ruta
app.use((req, res, next) => {
  if (req.path === '/graphql') {
    return next();
  }
  express.json()(req, res, next);
});

// Public routes (no authentication required)
app.use('/health', healthRoutes);

// Middleware condicional de autenticación - excluye /graphql para permitir introspección del Gateway
app.use((req, res, next) => {
  // Permitir que Apollo Gateway haga introspección sin token
  if (req.path === '/graphql') {
    return next();
  }
  // Aplicar autenticación al resto de rutas
  return auth(true)(req, res, next);
});

// Protected routes (authentication required)
app.use('/utilities', utilitiesRoutes);
app.use('/identifiers', identifiersRoutes);
app.use('/rates', ratesRoutes);
// 🔥 MONTAR LA NUEVA RUTA PROTEGIDA
app.use('/providers', providersRoutes);

// NOTA: El 404 handler se mueve a server.js después de montar GraphQL
// para evitar que capture las peticiones a /graphql

module.exports = app;