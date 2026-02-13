const mysql = require('mysql2/promise');

async function setupDB() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'root_password',
    port: 3306 // Forwarded port from docker-compose
  });

  try {
    console.log('Connected to MySQL.');

    // 1. Setup user_data_tpv_staging (Users Service)
    console.log('Setting up user_data_tpv_staging...');
    await connection.query('CREATE DATABASE IF NOT EXISTS user_data_tpv_staging');
    await connection.query('USE user_data_tpv_staging');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        rol VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        centro INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Check if admin exists
    const [users] = await connection.query('SELECT * FROM usuarios WHERE email = ?', ['admin@example.com']);
    if (users.length === 0) {
      console.log('Inserting admin user...');
      await connection.query(`
        INSERT INTO usuarios (nombre, email, password, rol, status, centro) VALUES 
        ('Admin', 'admin@example.com', 'admin123', 'admin', 'active', 1)
      `);
    } else {
      console.log('Admin user already exists.');
    }

    // Agent Provider Credentials
    console.log('Creating agent_provider_credentials table...');
    await connection.query(`
            CREATE TABLE IF NOT EXISTS agent_provider_credentials (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                provider_id INT NOT NULL,
                portal_username VARCHAR(255),
                portal_password VARCHAR(255),
                tpv_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE,
                UNIQUE KEY unique_user_provider (user_id, provider_id)
            )
        `);

    // 2. Setup nwfg_db (Rates Service)
    console.log('Setting up nwfg_db...');
    await connection.query('CREATE DATABASE IF NOT EXISTS nwfg_db');
    await connection.query('USE nwfg_db');

    // Providers table (ADR 002 shared entity source for Rates)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS providers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        logo_url VARCHAR(255),
        status ENUM('active', 'inactive') DEFAULT 'active'
      )
    `);

    // Utilities table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS utilities (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL, -- Ej: "Consolidated Edison"
        market ENUM('Gas', 'Electric') NOT NULL,
        alias_match JSON -- Ej: ["ConEd", "Con Edison", "ConEdison"]
      )
    `);

    // Rates table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS rates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        provider_id INT,
        utility_id INT,
        commodity ENUM('Gas', 'Electric') NOT NULL,
        rate_value DECIMAL(10, 4) NOT NULL,
        unit VARCHAR(20) DEFAULT 'kWh',
        term INT,
        status ENUM('draft', 'active', 'expired') DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed Rates data
    const [providers] = await connection.query('SELECT * FROM providers LIMIT 1');
    if (providers.length === 0) {
      console.log('Inserting mock provider...');
      await connection.query("INSERT INTO providers (nombre, logo_url, status) VALUES ('ConEd', 'http://logo.com/coned.png', 'active')");
    }

    const [utils] = await connection.query('SELECT * FROM utilities LIMIT 1');
    if (utils.length === 0) {
      console.log('Inserting mock utility...');
      await connection.query("INSERT INTO utilities (nombre, market) VALUES ('Con Edison', 'Electric')");
    }

    const [rates] = await connection.query('SELECT * FROM rates LIMIT 1');
    if (rates.length === 0) {
      console.log('Inserting mock rate...');
      await connection.query("INSERT INTO rates (provider_id, utility_id, commodity, rate_value, term, status) VALUES (1, 1, 'Electric', 0.1234, 12, 'active')");
    } else {
      console.log('Mock rate already exists.');
    }

    console.log('Database setup complete.');

  } catch (error) {
    console.error('Database setup failed:', error);
  } finally {
    await connection.end();
  }
}

setupDB();
