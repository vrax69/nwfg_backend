const mysql = require('mysql2/promise');

async function updateDB() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: 'root_password',
        port: 3306
    });

    try {
        console.log('Connected to MySQL.');
        await connection.query('USE user_data_tpv_staging');

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
        console.log('✅ Table created successfully.');

    } catch (error) {
        console.error('❌ Update failed:', error);
    } finally {
        await connection.end();
    }
}

updateDB();
