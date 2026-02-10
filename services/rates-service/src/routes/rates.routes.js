// src/routes/rates.routes.js
const express = require('express');
const router = express.Router();
// Importamos el controlador nuevo (aseguramos que traiga todo)
const ratesController = require('../controllers/rates.controller');
// Si existía un controlador anterior con otras funciones, deberíamos fusionar o migrar.
// Por ahora asumo que el usuario quiere que 'getRates' esté disponible.

// RUTA GET /api/rates (o /rates si el prefijo está en app.js)
// El usuarios no especificó middleware de auth para esta ruta de lectura pública, 
// o quizas es protegida. En app.js se ve: app.use('/rates', ratesRoutes);
// Si la ruta es pública para el front, no debería tener auth obligatoria.
// Pero app.js aplica auth global excepto /graphql y /health.
// Así que esta ruta requerirá token.

router.get('/', ratesController.getRates);

// Rutas anteriores (si las queremos mantener en el mismo archivo, 
// necesitamos que el controlador exporte también bulkInsert, etc. 
// Ojo: rates.controller.js que acabo de crear SOLO tiene getRates.
// Esto romperá las otras rutas si apunto al mismo archivo y no tiene esas funciones.
// El usuario pidió "ve a ... rates.controller.js y pega esto...".
// Si sobreescribí el archivo, perdí lo anterior.
// PERO Step 115 dice "Created file". Si el archivo ya existía, lo sobreescribí.
// En Step 21, services/rates-service/src tiene controllers (numChildren 6).
// Seguramente rates.controller.js YA EXISTÍA y lo reemplacé con solo getRates.
// Las rutas bulkInsert fallarán si no las restauro o si no eran parte de la migración aun.
// El usuario dijo "Paso 4: Migrar la Lógica... Pega esto".
// Asumiré que por ahora solo quiere PROBAR la nueva arquitectura con getRates.

module.exports = router;