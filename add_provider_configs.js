require('dotenv').config({ path: './services/rates-service/.env' }); // Try to load env from service specific file if running from root
const mysql = require('mysql2/promise');

async function updateDb() {
    const host = process.env.DB_HOST || '127.0.0.1'; // Fallback
    const user = process.env.DB_USER || 'root';
    const pass = process.env.DB_PASSWORD || 'root_password';
    const name = process.env.DB_NAME || 'nwfg_db';

    console.log(`🔌 Connecting to ${host} as ${user}...`);

    const connection = await mysql.createConnection({
        host: host,
        user: user,
        password: pass,
        database: name
    });

    try {
        console.log('🔌 Connected to MySQL (nwfg_db).');

        // 1. Create provider_configs table
        // JSON columns for flexibility
        await connection.query(`
      CREATE TABLE IF NOT EXISTS provider_configs (
        provider_id INT PRIMARY KEY,
        default_attributes JSON,
        active_utilities JSON,
        ui_template ENUM('TIERED', 'FIXED') DEFAULT 'FIXED'
      )
    `);
        console.log('✅ Table provider_configs created/verified.');

        // 2. Insert mock config for APGE (Provider ID 1? Let's check or assume 1 for now)
        // We'll upsert ID 1 (APGE) and maybe ID 2 (CleanSky)
        // Assuming Utility ID 1 exists (ConEd?) from previous setups
        // We will make APGE active in Utility ID 999 (Mock Utility) to test phantom generation

        const mockAttributes = JSON.stringify({
            rate_500: 0,
            rate_1000: 0,
            rate_2000: 0,
            term: 12,
            msf: 9.95,
            etf: "150",
            is_tiered: true
        });

        const activeUtils = JSON.stringify([999, 1]); // Active in Utility 999 and 1

        await connection.query(`
        INSERT INTO provider_configs (provider_id, default_attributes, active_utilities, ui_template)
        VALUES (1, ?, ?, 'TIERED')
        ON DUPLICATE KEY UPDATE
            default_attributes = VALUES(default_attributes),
            active_utilities = VALUES(active_utilities),
            ui_template = VALUES(ui_template)
    `, [mockAttributes, activeUtils]);

        console.log('✅ Configuration for Provider 1 (APGE) upserted.');

    } catch (error) {
        console.error('❌ Error updating DB:', error);
    } finally {
        await connection.end();
    }
}

updateDb();
