const mysql = require('mysql2/promise');
require('dotenv').config();

// Pool de conexiones para la base de datos master
const masterPool = mysql.createPool({
  host: process.env.MASTER_DB_HOST,
  port: process.env.MASTER_DB_PORT || 3306,
  user: process.env.MASTER_DB_USER,
  password: process.env.MASTER_DB_PASSWORD,
  database: process.env.MASTER_DB_NAME || 'Nwfg_master',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Función para probar la conexión
async function testConnection() {
  try {
    const [rows] = await masterPool.query('SELECT 1 as test');
    console.log('✅ Conexión a la base de datos establecida');
    return true;
  } catch (error) {
    console.error('❌ Error al conectar a la base de datos:', error.message);
    return false;
  }
}

module.exports = {
  masterPool,
  testConnection
};

