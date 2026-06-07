import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const pool = new Pool({
    user: 'smarthome_user',
    host: 'localhost',
    database: 'smarthome_db',
    password: 'haslo123',
    port: 5432,
});

export const initDB = async () => {
    const client = await pool.connect();
    try {
        console.log('Initializing database');
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS rooms (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS devices (
                id VARCHAR(255) PRIMARY KEY,
                friendly_name VARCHAR(255) NOT NULL,
                exposes JSONB,
                last_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            ALTER TABLE devices 
            ADD COLUMN IF NOT EXISTS room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL;
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS telemetry (
                time TIMESTAMPTZ NOT NULL,
                device_id VARCHAR(255) REFERENCES devices(id) ON DELETE CASCADE,
                payload JSONB NOT NULL
            );
        `);

        await client.query(`
            SELECT create_hypertable('telemetry', 'time', if_not_exists => TRUE);
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS energy_readings (
                id SERIAL PRIMARY KEY,
                device_name TEXT NOT NULL,
                value FLOAT NOT NULL,
                timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS power_readings (
                id SERIAL PRIMARY KEY,
                total_power FLOAT NOT NULL,
                timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS scenes (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                icon VARCHAR(50) DEFAULT 'Sparkles',
                color VARCHAR(50) DEFAULT 'from-primary/50 to-primary/20',
                actions JSONB DEFAULT '[]'::jsonb,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);

        const sceneCount = await client.query('SELECT COUNT(*) FROM scenes');
        if (parseInt(sceneCount.rows[0].count) === 0) {
            console.log('Seeding default scenes...');
            await client.query(`
                INSERT INTO scenes (name, icon, color, actions) VALUES
                ('Good Morning', 'Coffee', 'from-amber-200/50 to-yellow-100/30', '[]'),
                ('Goodnight', 'Moon', 'from-slate-300/40 to-blue-200/30', '[]'),
                ('Relax', 'Sparkles', 'from-pink-200/50 to-purple-200/30', '[]')
            `);
        }

        await client.query(`
            CREATE TABLE IF NOT EXISTS automations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                is_enabled BOOLEAN DEFAULT true,
                trigger_type VARCHAR(50), 
                trigger_config JSONB, 
                condition_config JSONB,
                action_config JSONB,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                home_id VARCHAR(255),
                avatar VARCHAR(1024),
                role VARCHAR(50) DEFAULT 'owner',
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);

        const userCount = await client.query('SELECT COUNT(*) FROM users');
        if (parseInt(userCount.rows[0].count) === 0) {
            console.log('Creating default owner account...');
            const hash = await bcrypt.hash('123456', 10);
            await client.query(`
                INSERT INTO users (username, password_hash, home_id, role)
                VALUES ('Owner', $1, 'home_main', 'owner')
            `, [hash]);
        }

    } catch (error) {
        console.error('Initialization error:', error);
    } finally {
        client.release();
    }
};

export default pool;