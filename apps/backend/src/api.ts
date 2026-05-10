import express from 'express';
import cors from 'cors';
import pool from './db';
import * as mqtt from 'mqtt';
import http from 'http';
import { Server } from 'socket.io';

const app = express();
const mqttClient = mqtt.connect('mqtt://localhost:1883');
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

app.use(cors());
app.use(express.json());

io.on('connection', (socket) => {
    console.log('New client connected to WebSockets');

    socket.on('disconnect', () => {
        console.log('Client disconnected from WebSockets');
    });
});

export const emitDeviceState = (friendlyName: string, payload: any) => {
    io.emit('device_state_update', { friendlyName, payload });
};

export const emitDevicesUpdated = () => {
    io.emit('device_list_updated');
};

// ==========================================
// ENERGY STATS
// ==========================================
app.get('/api/energy/stats', async (req, res) => {
    try {
        // 1. Zużycie dzisiaj w kWh (zostaje po staremu dla wielkiej liczby na ekranie)
        const todayResult = await pool.query(`
            SELECT COALESCE(MAX(value) - MIN(value), 0) AS usage 
            FROM energy_readings 
            WHERE timestamp >= CURRENT_DATE
        `);
        const todayKwh = parseFloat(todayResult.rows[0].usage);

        // 2. Zużycie wczoraj w kWh (do strzałki procentowej)
        const yesterdayResult = await pool.query(`
            SELECT COALESCE(MAX(value) - MIN(value), 0) AS usage 
            FROM energy_readings 
            WHERE timestamp >= CURRENT_DATE - INTERVAL '1 day' 
              AND timestamp < CURRENT_DATE
        `);
        const yesterdayKwh = parseFloat(yesterdayResult.rows[0].usage);

        // 3. NOWOŚĆ: Moc na żywo (Waty) z ostatnich 60 minut do wykresu falowego
        const historyResult = await pool.query(`
            SELECT total_power
            FROM power_readings
            WHERE timestamp >= NOW() - INTERVAL '60 minutes'
            ORDER BY timestamp ASC
        `);

        let history60m = historyResult.rows.map((row: any) => parseFloat(row.total_power));

        // Uzupełniamy zerami, jeśli baza działa krócej niż 60 minut
        while (history60m.length < 60) {
            history60m.unshift(0);
        }
        
        // Zabezpieczenie na wypadek nadmiarowych danych
        if (history60m.length > 60) {
            history60m = history60m.slice(-60);
        }

        res.json({
            todayKwh: todayKwh.toFixed(2),
            yesterdayKwh: yesterdayKwh.toFixed(2),
            history60m: history60m
        });

    } catch (error) {
        console.error("Błąd podczas pobierania statystyk energii:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ==========================================
// POKOJE (ROOMS)
// ==========================================
app.get('/api/rooms', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM rooms ORDER BY id ASC');
        res.json(result.rows);
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/rooms', async (req, res) => {
    const { name } = req.body;
    if (!name || name.trim() === '') return res.status(400).json({ error: 'Name required' });
    
    try {
        const result = await pool.query(
            'INSERT INTO rooms (name) VALUES ($1) RETURNING *',
            [name.trim()]
        );
        res.json(result.rows[0]);
    } catch (error: any) {
        if (error.code === '23505') { 
            return res.status(400).json({ error: 'Room already exists' });
        }
        res.status(500).json({ error: 'Database error' });
    }
});

app.delete('/api/rooms/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM rooms WHERE id = $1', [id]);
        emitDevicesUpdated(); 
        res.json({ message: 'Room deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

// ==========================================
// URZĄDZENIA (DEVICES)
// ==========================================
app.get('/api/devices', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT d.*, r.name as room_name, t.payload as last_payload 
            FROM devices d
            LEFT JOIN rooms r ON d.room_id = r.id
            LEFT JOIN LATERAL (
                SELECT payload FROM telemetry
                WHERE device_id = d.id
                ORDER BY time DESC
                LIMIT 1
            ) t ON true
            ORDER BY d.last_seen DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/api/devices/:friendly_name/room', async (req, res) => {
    const { friendly_name } = req.params;
    const { room_id } = req.body; 
    
    try {
        await pool.query(
            'UPDATE devices SET room_id = $1 WHERE friendly_name = $2',
            [room_id, friendly_name]
        );
        emitDevicesUpdated();
        res.json({ message: 'Room assigned' });
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

// ==========================================
// MOST ZIGBEE (BRIDGE & STEROWANIE)
// ==========================================
app.post('/api/bridge/permit_join', (req, res) => {
    const { permit } = req.body; 
    
    const topic = 'zigbee2mqtt/bridge/request/permit_join';
    const payload = JSON.stringify({ 
        value: permit, 
        time: permit ? 180 : 0 
    });

    mqttClient.publish(topic, payload, (err) => {
        if (err) {
            console.error('Permit join error:', err);
            return res.status(500).json({ error: 'Błąd MQTT' });
        }
        res.json({ message: 'Net mode changed', permit });
    });
});

app.post('/api/devices/:friendly_name/set', (req, res) => {
    const { friendly_name } = req.params;
    const payload = req.body;

    const topic = `zigbee2mqtt/${friendly_name}/set`;

    mqttClient.publish(topic, JSON.stringify(payload), (err) => {
        if (err) {
            console.error(`Failed to publish to ${friendly_name}:`, err);
            return res.status(500).json({ error: 'Comunication Error' });
        }

        console.log(`Command sent to [${friendly_name}]:`, payload);
        res.json({ message: 'Successfully sent command', topic, payload });
    });
});

app.delete('/api/devices/:friendly_name', async (req, res) => {
    const { friendly_name } = req.params;

    const topic = 'zigbee2mqtt/bridge/request/device/remove';
    const payload = JSON.stringify({ id: friendly_name, force: true });

    mqttClient.publish(topic, payload, async (err) => {
        if (err) {
            console.error(`Błąd MQTT podczas usuwania ${friendly_name}:`, err);
            return res.status(500).json({ error: 'Błąd komunikacji MQTT' });
        }

        try {
            const devResult = await pool.query('SELECT id FROM devices WHERE friendly_name = $1', [friendly_name]);
            
            if (devResult.rows.length > 0) {
                const deviceId = devResult.rows[0].id;
                await pool.query('DELETE FROM telemetry WHERE device_id = $1', [deviceId]);
                await pool.query('DELETE FROM devices WHERE id = $1', [deviceId]);
            }

            console.log(`Device [${friendly_name}] deleted.`);
            
            emitDevicesUpdated();
            
            res.json({ message: 'Device deleted' });
        } catch (dbError) {
            console.error('Database error during deleting:', dbError);
            res.status(500).json({ error: 'Database error' });
        }
    });
});

app.put('/api/devices/:friendly_name/rename', (req, res) => {
    const { friendly_name } = req.params;
    const { new_name } = req.body;

    if (!new_name || new_name.trim() === '') {
        return res.status(400).json({ error: 'Name can not be empty' });
    }

    const topic = 'zigbee2mqtt/bridge/request/device/rename';
    const payload = JSON.stringify({ 
        from: friendly_name, 
        to: new_name 
    });

    mqttClient.publish(topic, payload, (err) => {
        if (err) {
            console.error(`Error while changing device name from ${friendly_name} to ${new_name}:`, err);
            return res.status(500).json({ error: 'Communication error' });
        }
        
        console.log(`Changing device name: [${friendly_name}] -> [${new_name}]`);
        res.json({ message: 'Changing device name' });
    });
});

export const startAPI = () => {
    const PORT = 3000;
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`API server & WebSocket running on port ${PORT}`);
    });
};