CREATE DATABASE IF NOT EXISTS nwfg_db;
USE nwfg_db;

-- ADR 002: Entidad compartida para Users y Rates
CREATE TABLE IF NOT EXISTS providers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    logo_url VARCHAR(255),
    spl_slug VARCHAR(100),
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
    id               INT            AUTO_INCREMENT PRIMARY KEY,
    -- Provider's own plan identifier (e.g. ProductID in Spark files)
    external_id      VARCHAR(50)    NULL,
    -- DBA name shown on the plan (not always present)
    company_dba_name VARCHAR(150)   NULL,
    -- Plan / product name (e.g. "Pure Power 12")
    product          VARCHAR(200)   NULL,
    -- US state abbreviation (e.g. "NH")
    state            VARCHAR(10)    NULL,
    -- Fixed / Variable / etc.
    pricing_type     VARCHAR(50)    NULL,
    -- Residential / Commercial / etc.
    segment          VARCHAR(50)    NULL,
    provider_id      INT,
    utility_id       INT,
    commodity        ENUM('Gas', 'Electric') NOT NULL,
    rate_value       DECIMAL(10, 4) NOT NULL,
    -- Price To Compare
    ptc              DECIMAL(10, 6) NULL,
    -- Monthly Service Fee
    msf              DECIMAL(10, 2) NULL,
    -- Early Termination Fee description (e.g. "$100.00 Fixed Amount")
    cancellation     VARCHAR(100)   NULL,
    unit             VARCHAR(20)    DEFAULT 'kWh',
    term             INT,
    status           ENUM('draft', 'active', 'expired') DEFAULT 'draft',
    -- Extra fields that don't have a canonical column go here as JSON
    attributes       JSON           NULL,
    created_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES providers(id),
    FOREIGN KEY (utility_id)  REFERENCES utilities(id)
);