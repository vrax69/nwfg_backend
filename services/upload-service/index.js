const express = require('express');
const cors = require('cors');
require('dotenv').config();
const uploadRoutes = require('./src/routes/upload.routes');

const app = express();
const port = process.env.PORT || 4005;

// Middlewares globales
app.use(cors());
app.use(express.json());

// Montar rutas con prefijo
app.use('/upload', uploadRoutes);

app.listen(port, () => {
    console.log(`🚀 Upload Service robusto y autenticado en puerto ${port}`);
});