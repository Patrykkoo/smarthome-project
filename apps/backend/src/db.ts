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
        
        // 1. Nowa tabela: Pokoje
        await client.query(`
            CREATE TABLE IF NOT EXISTS rooms (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL
            );
        `);

        // 2. Tabela: Urządzenia (rozszerzona)
        await client.query(`
            CREATE TABLE IF NOT EXISTS devices (
                id VARCHAR(255) PRIMARY KEY,
                friendly_name VARCHAR(255) NOT NULL,
                exposes JSONB,
                last_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Dodanie kolumny room_id (jeśli już wcześniej miałeś utworzoną tabelę devices)
        await client.query(`
            ALTER TABLE devices 
            ADD COLUMN IF NOT EXISTS room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL;
        `);

        // 3. Tabela: Telemetria
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
    } catch (error) {
        console.error('Initialization error:', error);
    } finally {
        client.release();
    }
};

export default pool;