// src/controllers/health.controller.js
const checkHealth = async (req, res) => {
    try {
      await masterPool.query('SELECT 1'); // Prueba conexión a DB
      res.json({ status: 'UP', service: 'scripts-service', db: 'Connected' });
    } catch (err) {
      res.status(503).json({ status: 'DOWN', error: err.message });
    }
  };