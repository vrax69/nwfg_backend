-- Setup user_data_tpv_staging (Users Service)
CREATE DATABASE IF NOT EXISTS user_data_tpv_staging;
USE user_data_tpv_staging;

CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  rol VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  centro INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed Admin
INSERT IGNORE INTO usuarios (nombre, email, password, rol, status, centro) VALUES 
('Admin', 'admin@example.com', 'admin123', 'admin', 'active', 1);

-- Setup nwfg_db (Rates Service)
CREATE DATABASE IF NOT EXISTS nwfg_db;
USE nwfg_db;

CREATE TABLE IF NOT EXISTS providers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  logo_url VARCHAR(255),
  status ENUM('active', 'inactive') DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS utilities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  market ENUM('Gas', 'Electric') NOT NULL,
  alias_match JSON
);

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
);

-- Seed Rates Data
INSERT INTO providers (nombre, logo_url, status) SELECT 'ConEd', 'http://logo.com/coned.png', 'active' WHERE NOT EXISTS (SELECT * FROM providers WHERE nombre='ConEd');
INSERT INTO utilities (nombre, market) SELECT 'Con Edison', 'Electric' WHERE NOT EXISTS (SELECT * FROM utilities WHERE nombre='Con Edison');
INSERT INTO rates (provider_id, utility_id, commodity, rate_value, term, status) 
SELECT 1, 1, 'Electric', 0.1234, 12, 'active' 
WHERE NOT EXISTS (SELECT * FROM rates WHERE provider_id=1 AND utility_id=1 AND rate_value=0.1234);
