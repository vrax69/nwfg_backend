CREATE TABLE IF NOT EXISTS utility_aliases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dirty_name VARCHAR(255) NOT NULL UNIQUE,
    utility_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed some known aliases for testing
-- Example: 'ConEd' -> 1
-- INSERT IGNORE INTO utility_aliases (dirty_name, utility_id) VALUES ('ConEd', 1);
