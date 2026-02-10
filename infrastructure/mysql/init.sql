-- 1. Tabla Maestra de Utilities (Catálogo Único)
-- Aquí viven los datos "limpios". Nadie toca esto salvo el administrador.
CREATE TABLE IF NOT EXISTS Utility_Mapping (
    id INT AUTO_INCREMENT PRIMARY KEY,
    standard_name VARCHAR(255) NOT NULL, -- Ej: "Eversource"
    spl_code VARCHAR(50) NOT NULL,       -- Ej: "cs", "ie" (Código interno del proveedor)
    state CHAR(2) NOT NULL,              -- Ej: "NJ", "OH"
    service_type ENUM('Gas','Electric') NOT NULL,
    ldc_code VARCHAR(100),               -- Código técnico de la distribuidora
    logo_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_utility (standard_name, spl_code, state) -- Evita duplicados exactos
);

-- 2. Tabla de Alias (Sinónimos de Excel) - ¡NUEVA MEJOR PRÁCTICA!
-- Esta tabla le enseña al sistema cómo traducir los nombres sucios del Excel.
-- Si llega "NSTAR-BECO", el sistema busca aquí y sabe que pertenece al ID 105.
CREATE TABLE IF NOT EXISTS Utility_Aliases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    utility_id INT NOT NULL,             -- Relación con la tabla maestra
    alias_name VARCHAR(500) NOT NULL,    -- El nombre sucio: "NSTAR-BECO", "NSTAR", etc.
    FOREIGN KEY (utility_id) REFERENCES Utility_Mapping(id) ON DELETE CASCADE
);

-- 3. Tabla de Tarifas (Rates) - Normalizada
-- Aquí YA NO guardamos el nombre del Excel. Guardamos el ID oficial.
CREATE TABLE IF NOT EXISTS Rates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    utility_id INT NOT NULL,             -- <--- LA CLAVE DE ORO. Solo guardamos números.
    product_name VARCHAR(255),
    rate DECIMAL(10,5) NOT NULL,
    term_months INT,                     -- "duracion_rate" normalizado a número
    etf_fee DECIMAL(10,2),               -- Cargo cancelación (numérico para cálculos)
    monthly_fee DECIMAL(10,2),           -- Cargo mensual (numérico)
    effective_date DATE,
    expiration_date DATE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (utility_id) REFERENCES Utility_Mapping(id)
);

-- Índices para búsqueda ultra-rápida
CREATE INDEX idx_rates_utility ON Rates(utility_id);
CREATE INDEX idx_alias_search ON Utility_Aliases(alias_name);