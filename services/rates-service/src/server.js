require('dotenv').config();
const express = require('express');
const cors = require('cors');
const ratesRoutes = require('./routes/rates.routes');
// Eliminamos referencias a kafka o testConnections que causaban el error

const app = express();
const PORT = process.env.PORT || 4002;

// Middleware
app.use(cors());
app.use(express.json());

// Rutas
app.use('/api/rates', ratesRoutes);

// Health Check
app.get('/health', (req, res) => {
    res.status(200).send('OK - Rates Service is Healthy');
});

// Arrancar el servidor (Sin testConnections)
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Rates Service corriendo limpio en puerto ${PORT}`);
});
