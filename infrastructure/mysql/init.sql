CREATE DATABASE IF NOT EXISTS nwfg_db;
USE nwfg_db;

-- ADR 002: Entidad compartida para Users y Rates
CREATE TABLE IF NOT EXISTS providers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    logo_url VARCHAR(255),
    status ENUM('active', 'inactive') DEFAULT 'active'
);

-- ADR 007: Soporte para normalización de utilidades
CREATE TABLE IF NOT EXISTS utilities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL, -- Ej: "Consolidated Edison"
    market ENUM('Gas', 'Electric') NOT NULL,
    alias_match JSON -- Ej: ["ConEd", "Con Edison", "ConEdison"]
);

-- ADR 007 & 010: Tabla optimizada para ingesta masiva
CREATE TABLE IF NOT EXISTS rates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    provider_id INT,
    utility_id INT,
    commodity ENUM('Gas', 'Electric') NOT NULL,
    rate_value DECIMAL(10, 4) NOT NULL,
    unit VARCHAR(20) DEFAULT 'kWh',
    term INT,
    status ENUM('draft', 'active', 'expired') DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES providers(id),
    FOREIGN KEY (utility_id) REFERENCES utilities(id)
);