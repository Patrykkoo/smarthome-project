import { Pool } from 'pg';

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
        
        // 1. Pokoje
        await client.query(`
            CREATE TABLE IF NOT EXISTS rooms (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL
            );
        `);

        // 2. Urządzenia
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

        // 3. Telemetria
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

        // 4. Historia zużycia energii (dzienna w kWh)
        await client.query(`
            CREATE TABLE IF NOT EXISTS energy_readings (
                id SERIAL PRIMARY KEY,
                device_name TEXT NOT NULL,
                value FLOAT NOT NULL,
                timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 5. Historia poboru mocy na żywo (Waty do wykresu)
        await client.query(`
            CREATE TABLE IF NOT EXISTS power_readings (
                id SERIAL PRIMARY KEY,
                total_power FLOAT NOT NULL,
                timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);

    } catch (error) {
        console.error('Initialization error:', error);
    } finally {
        client.release();
    }
};

export default pool;