const mysql = require('mysql2/promise');

async function manageMocks() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: 'root_password',
        port: 3306
    });

    try {
        console.log('🔌 Connected to MySQL.');

        // 1. Create Agent User
        console.log('👤 Creating/Updating Agent User...');
        await connection.query('USE user_data_tpv_staging');

        // Check if exists
        const [users] = await connection.query('SELECT * FROM usuarios WHERE email = ?', ['agent@example.com']);
        if (users.length === 0) {
            await connection.query(`
                INSERT INTO usuarios (nombre, email, password, rol, status, centro) 
                VALUES ('Mock Agent', 'agent@example.com', 'agent123', 'sales', 'active', 1)
            `);
            console.log('✅ Agent user created.');
        } else {
            console.log('ℹ️ Agent user already exists.');
        }

        // 2. Mix Rate Statuses
        console.log('📉 Updating Rates Statuses...');
        await connection.query('USE nwfg_db');

        // Set all to draft first
        await connection.query("UPDATE rates SET status = 'draft'");

        // Set 50% to active (approx, using ID modulo)
        const [updateResult] = await connection.query("UPDATE rates SET status = 'active' WHERE id % 2 = 0");
        console.log(`✅ Set ${updateResult.changedRows} rates to ACTIVE (Evens).`);
        console.log(`ℹ️ Odds remain DRAFT.`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await connection.end();
    }
}

manageMocks();
