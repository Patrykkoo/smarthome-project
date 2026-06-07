import express from 'express';
import cors from 'cors';
import pool from './db';
import * as mqtt from 'mqtt';
import http from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

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

export const emitDeviceJoined = (friendlyName: string) => {
    io.emit('device_joined', { friendlyName });
};

const JWT_SECRET = process.env.JWT_SECRET || 'tajny-klucz';

export const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: 'Access denied' });
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        (req as any).user = user;
        next();
    });
};

export let currentPresenceMode = 'home';
export const automationNotifier = { onUpdate: () => {} };

app.get('/api/presence', (req, res) => {
    res.json({ mode: currentPresenceMode });
});

app.post('/api/presence', (req, res) => {
    currentPresenceMode = req.body.mode || 'home';
    io.emit('presence_update', { mode: currentPresenceMode });
    res.json({ mode: currentPresenceMode });
});

app.get('/api/energy/stats', async (req, res) => {
    try {
        const todayResult = await pool.query(`
            WITH daily_agg AS (
                SELECT device_name,
                       (timestamp AT TIME ZONE 'Europe/Warsaw')::date as date_val,
                       MIN(value) as min_val,
                       MAX(value) as max_val
                FROM energy_readings
                WHERE timestamp >= (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Warsaw')::date - INTERVAL '7 days'
                GROUP BY device_name, date_val
            ),
            diffs AS (
                SELECT device_name,
                       date_val,
                       GREATEST(0, max_val - LAG(max_val, 1, min_val) OVER (PARTITION BY device_name ORDER BY date_val)) as usage
                FROM daily_agg
            )
            SELECT COALESCE(SUM(usage), 0) AS usage 
            FROM diffs 
            WHERE date_val = (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Warsaw')::date
        `);
        const todayKwh = parseFloat(todayResult.rows[0].usage);

        const yesterdayResult = await pool.query(`
            WITH daily_agg AS (
                SELECT device_name,
                       (timestamp AT TIME ZONE 'Europe/Warsaw')::date as date_val,
                       MIN(value) as min_val,
                       MAX(value) as max_val
                FROM energy_readings
                WHERE timestamp >= (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Warsaw')::date - INTERVAL '7 days'
                GROUP BY device_name, date_val
            ),
            diffs AS (
                SELECT device_name,
                       date_val,
                       GREATEST(0, max_val - LAG(max_val, 1, min_val) OVER (PARTITION BY device_name ORDER BY date_val)) as usage
                FROM daily_agg
            )
            SELECT COALESCE(SUM(usage), 0) AS usage 
            FROM diffs 
            WHERE date_val = (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Warsaw')::date - INTERVAL '1 day'
        `);
        const yesterdayKwh = parseFloat(yesterdayResult.rows[0].usage);

        const historyResult = await pool.query(`
            SELECT total_power
            FROM power_readings
            WHERE timestamp >= NOW() - INTERVAL '60 minutes'
            ORDER BY timestamp ASC
        `);

        let history60m = historyResult.rows.map((row: any) => parseFloat(row.total_power));

        while (history60m.length < 60) {
            history60m.unshift(0);
        }
        
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

app.get('/api/energy/history/:timeframe', async (req, res) => {
    const { timeframe } = req.params;
    let query = '';
    let labels: string[] = [];
    
    if (timeframe === 'week') {
        labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        query = `
            WITH daily_agg AS (
                SELECT device_name,
                       (timestamp AT TIME ZONE 'Europe/Warsaw')::date as date_val,
                       MIN(value) as min_val,
                       MAX(value) as max_val
                FROM energy_readings
                WHERE timestamp >= date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Warsaw') - INTERVAL '1 week'
                GROUP BY device_name, date_val
            ),
            diffs AS (
                SELECT device_name,
                       date_val,
                       GREATEST(0, max_val - LAG(max_val, 1, min_val) OVER (PARTITION BY device_name ORDER BY date_val)) as usage
                FROM daily_agg
            )
            SELECT EXTRACT(ISODOW FROM date_val) as label_idx, SUM(usage) as val
            FROM diffs
            WHERE date_trunc('week', date_val) = date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Warsaw')
            GROUP BY label_idx ORDER BY label_idx`;
            
    } else if (timeframe === 'month') {
        const now = new Date();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        labels = Array.from({length: daysInMonth}, (_, i) => (i + 1).toString());
        
        query = `
            WITH daily_agg AS (
                SELECT device_name,
                       (timestamp AT TIME ZONE 'Europe/Warsaw')::date as date_val,
                       MIN(value) as min_val,
                       MAX(value) as max_val
                FROM energy_readings
                WHERE timestamp >= date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Warsaw') - INTERVAL '1 week'
                GROUP BY device_name, date_val
            ),
            diffs AS (
                SELECT device_name,
                       date_val,
                       GREATEST(0, max_val - LAG(max_val, 1, min_val) OVER (PARTITION BY device_name ORDER BY date_val)) as usage
                FROM daily_agg
            )
            SELECT EXTRACT(DAY FROM date_val) as label_idx, SUM(usage) as val
            FROM diffs
            WHERE date_trunc('month', date_val) = date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Warsaw')
            GROUP BY label_idx ORDER BY label_idx`;
            
    } else if (timeframe === 'year') {
        labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        query = `
            WITH monthly_agg AS (
                SELECT device_name,
                       date_trunc('month', timestamp AT TIME ZONE 'Europe/Warsaw') as month_val,
                       MIN(value) as min_val,
                       MAX(value) as max_val
                FROM energy_readings
                WHERE timestamp >= date_trunc('year', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Warsaw') - INTERVAL '1 month'
                GROUP BY device_name, month_val
            ),
            diffs AS (
                SELECT device_name,
                       month_val,
                       GREATEST(0, max_val - LAG(max_val, 1, min_val) OVER (PARTITION BY device_name ORDER BY month_val)) as usage
                FROM monthly_agg
            )
            SELECT EXTRACT(MONTH FROM month_val) as label_idx, SUM(usage) as val
            FROM diffs
            WHERE date_trunc('year', month_val) = date_trunc('year', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Warsaw')
            GROUP BY label_idx ORDER BY label_idx`;
            
    } else {
        return res.status(400).json({ error: 'Invalid timeframe parameter' });
    }

    try {
        const result = await pool.query(query);
        const totalKwh = result.rows.reduce((sum, r) => sum + parseFloat(r.val), 0);
        
        const chart = labels.map((label, i) => {
            const row = result.rows.find(r => Number(r.label_idx) === (i + 1));
            return { label, value: row ? parseFloat(row.val) : 0 };
        });

        res.json({ totalKwh, chart });
    } catch (error) {
        console.error("Database error in /api/energy/history/:timeframe :", error);
        res.status(500).json({ error: 'Database error' });
    }
});

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
        res.json({ message: 'Successfully sent command', topic, payload });
    });
});

app.delete('/api/devices/:friendly_name', async (req, res) => {
    const { friendly_name } = req.params;

    const topic = 'zigbee2mqtt/bridge/request/device/remove';
    const payload = JSON.stringify({ id: friendly_name, force: true });

    mqttClient.publish(topic, payload, async (err) => {
        if (err) return res.status(500).json({ error: 'Błąd komunikacji MQTT' });

        try {
            const devResult = await pool.query('SELECT id FROM devices WHERE friendly_name = $1', [friendly_name]);
            if (devResult.rows.length > 0) {
                const deviceId = devResult.rows[0].id;
                await pool.query('DELETE FROM telemetry WHERE device_id = $1', [deviceId]);
                await pool.query('DELETE FROM devices WHERE id = $1', [deviceId]);
            }
            emitDevicesUpdated();
            res.json({ message: 'Device deleted' });
        } catch (dbError) {
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
    const payload = JSON.stringify({ from: friendly_name, to: new_name });

    mqttClient.publish(topic, payload, (err) => {
        if (err) return res.status(500).json({ error: 'Communication error' });
        res.json({ message: 'Changing device name' });
    });
});

export const triggerSceneLocal = async (id: number) => {
    try {
        const result = await pool.query('SELECT actions FROM scenes WHERE id = $1', [id]);
        if (result.rows.length === 0) return;

        const actions = result.rows[0].actions;
        
        actions.forEach((action: any) => {
            if (action.friendly_name && action.payload) {
                const topic = `zigbee2mqtt/${action.friendly_name}/set`;
                mqttClient.publish(topic, JSON.stringify(action.payload), (err) => {
                    if (err) console.error(`Failed to trigger device ${action.friendly_name} in scene ${id}:`, err);
                });
            }
        });
    } catch (error) {
        console.error('Trigger scene error:', error);
    }
};

app.get('/api/scenes', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM scenes ORDER BY id ASC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/scenes', async (req, res) => {
    const { name, icon, color, actions } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO scenes (name, icon, color, actions) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, icon || 'Sparkles', color || 'from-primary/50 to-primary/20', JSON.stringify(actions || [])]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.put('/api/scenes/:id', async (req, res) => {
    const { id } = req.params;
    const { name, icon, color, actions } = req.body;
    try {
        const result = await pool.query(
            'UPDATE scenes SET name = $1, icon = $2, color = $3, actions = $4 WHERE id = $5 RETURNING *',
            [name, icon, color, JSON.stringify(actions || []), id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Scene not found' });
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.delete('/api/scenes/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM scenes WHERE id = $1', [id]);
        res.json({ message: 'Scene deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/scenes/:id/trigger', async (req, res) => {
    const { id } = req.params;
    await triggerSceneLocal(Number(id));
    res.json({ message: 'Scene triggered successfully' });
});

app.get('/api/automations', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM automations ORDER BY id ASC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/automations', async (req, res) => {
    const { name, is_enabled, trigger_type, trigger_config, condition_config, action_config } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO automations (name, is_enabled, trigger_type, trigger_config, condition_config, action_config) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [name, is_enabled ?? true, trigger_type, JSON.stringify(trigger_config), JSON.stringify(condition_config), JSON.stringify(action_config)]
        );
        automationNotifier.onUpdate(); 
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.put('/api/automations/:id', async (req, res) => {
    const { id } = req.params;
    const { name, is_enabled, trigger_type, trigger_config, condition_config, action_config } = req.body;
    try {
        const result = await pool.query(
            'UPDATE automations SET name = $1, is_enabled = $2, trigger_type = $3, trigger_config = $4, condition_config = $5, action_config = $6 WHERE id = $7 RETURNING *',
            [name, is_enabled, trigger_type, JSON.stringify(trigger_config), JSON.stringify(condition_config), JSON.stringify(action_config), id]
        );
        automationNotifier.onUpdate();
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.delete('/api/automations/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM automations WHERE id = $1', [id]);
        automationNotifier.onUpdate();
        res.json({ message: 'Automation deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/auth/kiosk-login', async (req, res) => {
    const { pin } = req.body;
    try {
        const result = await pool.query("SELECT * FROM users WHERE role = 'owner' LIMIT 1");
        if (result.rows.length === 0) return res.status(404).json({ error: 'Owner account not found' });
        
        const user = result.rows[0];
        const validPassword = await bcrypt.compare(pin, user.password_hash);
        
        if (!validPassword) return res.status(401).json({ error: 'Invalid PIN' });
        
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role, homeId: user.home_id }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ token, user: { id: user.id, username: user.username, homeId: user.home_id, avatar: user.avatar, role: user.role } });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/auth/verify-pin', authenticateToken, async (req, res) => {
    const { pin } = req.body;
    const userId = ((req as any).user).id;
    try {
        const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
        const valid = await bcrypt.compare(pin, result.rows[0].password_hash);
        if (valid) res.json({ success: true });
        else res.status(401).json({ error: 'Invalid PIN' });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const userId = ((req as any).user).id;
        const result = await pool.query('SELECT id, username, home_id as "homeId", avatar, role FROM users WHERE id = $1', [userId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json(result.rows[0]);
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/auth/profile', authenticateToken, async (req, res) => {
    const { username, avatarUrl } = req.body;
    const userId = ((req as any).user).id;
    try {
        const result = await pool.query(
            'UPDATE users SET username = $1, avatar = $2 WHERE id = $3 RETURNING id, username, home_id as "homeId", avatar, role',
            [username, avatarUrl, userId]
        );
        res.json(result.rows[0]);
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/auth/password', authenticateToken, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const userId = ((req as any).user).id;
    try {
        const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
        
        const valid = await bcrypt.compare(oldPassword, result.rows[0].password_hash);
        if (!valid) return res.status(401).json({ error: 'Invalid current PIN' });
        
        const newHash = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);
        res.json({ message: 'Password updated' });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

export const startAPI = () => {
    const PORT = 3000;
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`API server & WebSocket running on port ${PORT}`);
    });
};