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
})

app.use(cors());
app.use(express.json());

io.on('connection', (socket) => {
    console.log('New client connected to WebSockets');

    socket.on('disconnect', () => {
        console.log('Client disconnected from WebSockets');
    });
})

export const emitDeviceState = (friendlyName: string, payload: any) => {
    io.emit('device_state_update', { friendlyName, payload });
};

export const emitDevicesUpdated = () => {
    io.emit('device_list_updated');
};

app.get('/api/devices', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT d.*, t.payload as last_payload 
            FROM devices d
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
    server.listen(PORT, () => {
        console.log(`API server & WebSocket running on port ${PORT}`);
    });
};