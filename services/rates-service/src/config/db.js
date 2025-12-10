/**
 * Database configuration for the Rates Service
 * --------------------------------------------
 * Este servicio necesita acceder a dos bases de datos diferentes:
 *
 * 1. Nwfg_master
 *    - utilities
 *    - utility_aliases
 *    - utility_identifiers
 *    - rates
 *    - scripts (futuro)
 *
 * 2. user_data_tpv_staging
 *    - proveedores (providers)
 *    - user_provider_account (permiso por proveedor, futuro)
 *
 * Cada base usa su propio pool de conexiones para evitar bloqueo
 * y mantener compatibilidad con el user-service.
 */

const mysql = require('mysql2/promise');

// =======================================================
// 1️⃣  Conexión al esquema Nwfg_master  (Core del servicio)
// =======================================================

const masterPool = mysql.createPool({
  host: process.env.MASTER_DB_HOST,
  port: process.env.MASTER_DB_PORT || 3306,
  user: process.env.MASTER_DB_USER,
  password: process.env.MASTER_DB_PASSWORD,
  database: process.env.MASTER_DB_NAME || 'Nwfg_master',
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  enableKeepAlive: true
});

// ===============================================================
// 2️⃣  Conexión al esquema user_data_tpv_staging (Solo providers)
// ===============================================================

const userPool = mysql.createPool({
  host: process.env.USER_DB_HOST,
  port: process.env.USER_DB_PORT || 3306,
  user: process.env.USER_DB_USER,
  password: process.env.USER_DB_PASSWORD,
  database: process.env.USER_DB_NAME || 'user_data_tpv_staging',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true
});

// ===================================================================
// 🧪 Función opcional para verificar ambas conexiones al iniciar server
// ===================================================================

async function testConnections() {
  try {
    const [m] = await masterPool.query('SELECT 1 + 1 AS result');
    console.log('✔ Connected to Nwfg_master (result:', m[0].result, ')');

    const [u] = await userPool.query('SELECT 1 + 1 AS result');
    console.log('✔ Connected to user_data_tpv_staging (result:', u[0].result, ')');

  } catch (err) {
    console.error('❌ Database connection error:', err);
  }
}

// ================================================================
// Exportación de pools (los modelos usarán estas conexiones)
// ================================================================

module.exports = {
  masterPool,
  userPool,
  testConnections
};
