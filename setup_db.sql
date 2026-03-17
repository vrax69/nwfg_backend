-- ============================================================
-- NWFG Platform — Setup Completo de Base de Datos
-- Ejecutar con: docker exec mysql_db mysql -u root -proot_password < setup_db.sql
-- ⚠️  Idempotente: usa IF NOT EXISTS / INSERT IGNORE en todo.
-- ⚠️  Si cambias init.sql necesitas `docker-compose down -v` para aplicarlo.
-- ============================================================

-- ============================================================
-- DATABASE: user_data_tpv_staging  (Users Service)
-- ============================================================
CREATE DATABASE IF NOT EXISTS user_data_tpv_staging;
USE user_data_tpv_staging;

CREATE TABLE IF NOT EXISTS usuarios (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    nombre     VARCHAR(255) NOT NULL,
    username   VARCHAR(100) NOT NULL UNIQUE COMMENT 'Identificador de login. Formato: nombre.apellido. Gestionado por staff.',
    email      VARCHAR(255) UNIQUE COMMENT 'Solo informativo. NO se usa para login.',
    password   VARCHAR(255) NOT NULL,
    rol        VARCHAR(50)  NOT NULL,
    status     VARCHAR(50)  DEFAULT 'active',
    centro     INT,
    created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- Catálogo de proveedores (compartido con users-service para TPV accounts)
CREATE TABLE IF NOT EXISTS proveedores (
    id       INT AUTO_INCREMENT PRIMARY KEY,
    nombre   VARCHAR(100) NOT NULL,
    logo_url VARCHAR(255),
    status   ENUM('active', 'inactive') DEFAULT 'active',
    spl_slug VARCHAR(50) COMMENT 'Slug para URL de guiones PDF en MinIO (ej: cs, ie, apge)'
);

-- Cuentas TPV por agente (un agente puede tener cuenta en múltiples proveedores)
CREATE TABLE IF NOT EXISTS user_provider_account (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    user_id      INT NOT NULL,
    provider_id  INT NOT NULL,
    tpv_id       VARCHAR(100),
    tpv_username VARCHAR(255),
    status       ENUM('active', 'inactive') DEFAULT 'active',
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_provider (user_id, provider_id)
);

-- ============================================================
-- SEED: Usuarios del sistema (fuente de verdad: NWFG_DOCS.md §15)
-- IDs fijos-- Seed Admin
-- username = identificador de login (formato nombre.apellido, gestionado por staff)
-- email    = solo informativo
INSERT INTO usuarios (id, nombre, username, email, password, rol, centro, status) VALUES
(5, 'Brian',      'brian',      'brian@nwfg.com',      'Gabriela19@', 'admin', 1, 'active'),
(6, 'FIS Agent',  'fis.agent',  'fis.agent@nwfg.com',  'fis',         'agent', 2, 'active'),
(7, 'NWFG Agent', 'nwfg.agent', 'nwfg.agent@nwfg.com', 'nwfg',        'agent', 1, 'active')
ON DUPLICATE KEY UPDATE
    nombre   = VALUES(nombre),
    username = VALUES(username),
    email    = VALUES(email),
    password = VALUES(password),
    rol      = VALUES(rol),
    centro   = VALUES(centro),
    status   = VALUES(status);


-- ============================================================
-- DATABASE: nwfg_db  (Rates Service + Upload Service)
-- ============================================================
CREATE DATABASE IF NOT EXISTS nwfg_db;
USE nwfg_db;

-- Catálogo de proveedores de energía
CREATE TABLE IF NOT EXISTS providers (
    id       INT AUTO_INCREMENT PRIMARY KEY,
    nombre   VARCHAR(100) NOT NULL,
    logo_url VARCHAR(255),
    status   ENUM('active', 'inactive') DEFAULT 'active'
);

-- Catálogo de utilities (distribuidoras de energía)
CREATE TABLE IF NOT EXISTS utilities (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    nombre      VARCHAR(100) NOT NULL,
    market      ENUM('Gas', 'Electric') NOT NULL,
    alias_match JSON COMMENT 'Array de nombres alternativos: ["ConEd","Con Edison"]'
);

-- Tabla maestra de tarifas
-- attributes (JSON): absorbe columnas impredecibles del Excel sin romper el schema (ADR-003)
CREATE TABLE IF NOT EXISTS rates (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    provider_id INT,
    utility_id  INT,
    commodity   ENUM('Gas', 'Electric') NOT NULL,
    rate_value  DECIMAL(10, 4) NOT NULL,
    unit        VARCHAR(20)    DEFAULT 'kWh',
    term        INT,
    status      ENUM('draft', 'active', 'expired') DEFAULT 'draft',
    attributes  JSON           COMMENT 'Columnas extra del Excel (Grupo 1 / CleanSky)',
    created_at  TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES providers(id),
    FOREIGN KEY (utility_id)  REFERENCES utilities(id)
);

-- Mapeo sucio→limpio para el ETL (Human-in-the-loop)
-- Cuando MISSING_ALIAS llega al admin, este resuelve aquí y re-envía /confirm
CREATE TABLE IF NOT EXISTS utility_aliases (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    dirty_name VARCHAR(255) NOT NULL,
    utility_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_dirty_name (dirty_name),
    FOREIGN KEY (utility_id) REFERENCES utilities(id)
);

-- Configuraciones para Phantom Rates (Grupo 2 / APGE — ADR-003)
CREATE TABLE IF NOT EXISTS provider_configs (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    provider_id  INT NOT NULL,
    config_key   VARCHAR(100) NOT NULL,
    config_value TEXT,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES providers(id)
);

-- Bóveda de credenciales de portales de terceros por agente
-- NUNCA exponer portal_password en GraphQL — solo isPasswordSet: Boolean (ADR-002)
CREATE TABLE IF NOT EXISTS agent_provider_credentials (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    provider_id     INT NOT NULL,
    portal_username VARCHAR(255),
    portal_password VARCHAR(255),
    tpv_id          VARCHAR(100),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_provider (user_id, provider_id)
);

-- Auditoría ETL: registro de cada Excel subido (ADR-004)
-- logId viaja en Redis (upload:{sessionId}:logId) para el proceso async
CREATE TABLE IF NOT EXISTS upload_logs (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    user_id           INT NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    minio_path        VARCHAR(500) NOT NULL COMMENT 'audit/excels/{fecha}_{sessionId}_{filename}.xlsx',
    file_size_bytes   INT,
    status            ENUM('processing', 'completed', 'failed', 'reverted') DEFAULT 'processing',
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================
-- SEED: Datos base de nwfg_db
-- ============================================================
INSERT INTO providers (nombre, logo_url, status)
SELECT 'ConEd', NULL, 'active'
WHERE NOT EXISTS (SELECT 1 FROM providers WHERE nombre = 'ConEd');

INSERT INTO utilities (nombre, market, alias_match)
SELECT 'Con Edison', 'Electric', '["ConEd","Con Edison","ConEdison"]'
WHERE NOT EXISTS (SELECT 1 FROM utilities WHERE nombre = 'Con Edison');
