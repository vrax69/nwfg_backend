CREATE TABLE IF NOT EXISTS provider_configs (
    provider_id INT PRIMARY KEY,
    default_attributes JSON,
    active_utilities JSON,
    ui_template ENUM('TIERED', 'FIXED') DEFAULT 'FIXED'
);

-- APGE Config (Provider 1)
-- Active in Utility 999 (Mock) and 1 (ConEd?)
INSERT INTO provider_configs (provider_id, default_attributes, active_utilities, ui_template)
VALUES (
    1, 
    '{"rate_500": 0, "rate_1000": 0, "rate_2000": 0, "term": 12, "msf": 9.95, "etf": "150", "is_tiered": true, "State": "NY"}', 
    '[999, 1]', 
    'TIERED'
)
ON DUPLICATE KEY UPDATE
    default_attributes = VALUES(default_attributes),
    active_utilities = VALUES(active_utilities),
    ui_template = VALUES(ui_template);
