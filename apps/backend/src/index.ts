import * as mqtt from 'mqtt';
import pool, { initDB } from './db';
import { startAPI, emitDeviceState, emitDevicesUpdated, emitDeviceJoined, automationNotifier, triggerSceneLocal, currentPresenceMode } from './api';

// =====================================
// IN-MEMORY AUTOMATION CACHE ENGINE
// =====================================
let deviceAutomations: Record<string, any[]> = {};
let timeAutomations: any[] = [];
let lastEvaluatedMinute = -1;

const reloadAutomations = async () => {
    try {
        const res = await pool.query('SELECT * FROM automations WHERE is_enabled = true');
        deviceAutomations = {};
        timeAutomations = [];
        
        res.rows.forEach(a => {
            if (a.trigger_type === 'time') {
                timeAutomations.push(a);
            } else if (a.trigger_type === 'device_state' && a.trigger_config?.device) {
                if (!deviceAutomations[a.trigger_config.device]) deviceAutomations[a.trigger_config.device] = [];
                deviceAutomations[a.trigger_config.device].push(a);
            }
        });
        console.log(`[Auto Engine] Cache reloaded: ${timeAutomations.length} Time rules, ${Object.keys(deviceAutomations).length} Device rules active.`);
    } catch (e) {
        console.error('[Auto Engine] Cache reload failed:', e);
    }
};

// Nasłuchiwanie na zmiany z API
automationNotifier.onUpdate = reloadAutomations;

// Właściwa egzekucja Automatyzacji
const executeAutomation = (automation: any) => {
    const cond = automation.condition_config;
    
    // AND Condition: Sprawdzamy tryb (Home/Away/Any)
    if (cond?.mode && cond.mode !== 'any' && cond.mode !== currentPresenceMode) {
        console.log(`[Auto Engine] Skipped ${automation.name} -> Wrong Mode (${currentPresenceMode} != ${cond.mode})`);
        return;
    }
    
    // DO Action: Odlapamy konkretną scenę
    if (automation.action_config?.scene_id) {
        console.log(`[Auto Engine] Executing: ${automation.name} -> Scene ID: ${automation.action_config.scene_id}`);
        triggerSceneLocal(automation.action_config.scene_id);
    }
};

const start = async () => {
    await initDB();
    startAPI();
    
    // Pobieramy automatyzacje do RAM przy starcie
    await reloadAutomations();

    const client = mqtt.connect('mqtt://localhost:1883');

    // W PĘTLI CO 60 SEKUND: Zapis mocy ORAZ sprawdzenie automatyzacji czasowych
    setInterval(async () => {
        // 1. Zapis Historii Mocy
        try {
            const result = await pool.query(`
                SELECT payload->>'power' as power 
                FROM (
                    SELECT DISTINCT ON (device_id) payload
                    FROM telemetry
                    WHERE payload ? 'power'
                    ORDER BY device_id, time DESC
                ) t
            `);
            
            const totalPower = result.rows.reduce((sum, row) => sum + (parseFloat(row.power) || 0), 0);
            await pool.query('INSERT INTO power_readings (total_power) VALUES ($1)', [totalPower]);
            await pool.query(`DELETE FROM power_readings WHERE timestamp < NOW() - INTERVAL '2 hours'`);
        } catch (error) {
            console.error('Błąd zapisu historii mocy:', error);
        }

        // 2. Automatyzacje na bazie czasu (Time-based triggers)
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hour12: false });
        const hhmm = formatter.format(now); // Np. "07:00"
        
        // Zabezpieczenie przed wielokrotnym odpalaniem w obrębie tej samej minuty
        if (now.getMinutes() !== lastEvaluatedMinute) {
            lastEvaluatedMinute = now.getMinutes();
            timeAutomations.forEach(a => {
                if (a.trigger_config?.time === hhmm) executeAutomation(a);
            });
        }
    }, 60000);

    client.on('connect', () => {
        console.log('Connected with MQTT');
        client.subscribe('zigbee2mqtt/bridge/devices');
        client.subscribe('zigbee2mqtt/#');
    });

    client.on('message', async (topic, message) => {
        try {
            const rawPayload = message.toString();
            let data: any;
            
            try {
                data = JSON.parse(rawPayload);
            } catch (e) {
                data = { state: rawPayload };
            }
            
            if (topic === 'zigbee2mqtt/bridge/devices') {
                const existingRes = await pool.query('SELECT id FROM devices');
                const existingIds = new Set(existingRes.rows.map(r => r.id));
                const newlyJoined: string[] = [];

                for (const device of data) {
                    if (device.type === 'Coordinator') continue;

                    const id = device.ieee_address;
                    const friendlyName = device.friendly_name;
                    const exposes = JSON.stringify(device.definition?.exposes || []);

                    if (!existingIds.has(id) && existingIds.size > 0) {
                        newlyJoined.push(friendlyName);
                    }

                    await pool.query(`
                        INSERT INTO devices (id, friendly_name, exposes, last_seen)
                        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                        ON CONFLICT (id) DO UPDATE 
                        SET friendly_name = EXCLUDED.friendly_name, 
                            exposes = EXCLUDED.exposes,
                            last_seen = CURRENT_TIMESTAMP;
                    `, [id, friendlyName, exposes]);
                }

                console.log('Devices updated');
                emitDevicesUpdated();
                
                newlyJoined.forEach(name => emitDeviceJoined(name));
                return;
            }

            if (topic.startsWith('zigbee2mqtt/bridge')) return;

            let friendlyName = topic.replace('zigbee2mqtt/', '');
            let isAvailability = false;

            if (friendlyName.endsWith('/availability')) {
                friendlyName = friendlyName.replace('/availability', '');
                isAvailability = true;
            }

            const deviceResult = await pool.query(
                'SELECT id FROM devices WHERE friendly_name = $1',
                [friendlyName]
            );

            if (deviceResult.rows.length > 0) {
                const deviceId = deviceResult.rows[0].id;
                
                const lastTelemetry = await pool.query(`
                    SELECT payload FROM telemetry WHERE device_id = $1 ORDER BY time DESC LIMIT 1
                `, [deviceId]);
                
                let mergedPayload = lastTelemetry.rows.length > 0 ? lastTelemetry.rows[0].payload : {};

                if (isAvailability) {
                    const stateValue = data.state || data;
                    const availabilityStatus = typeof stateValue === 'string' ? stateValue.toLowerCase() : 'offline';
                    
                    mergedPayload = { 
                        ...mergedPayload, 
                        availability: availabilityStatus,
                        state: availabilityStatus === 'offline' ? 'OFFLINE' : mergedPayload.state 
                    };
                } else {
                    mergedPayload = { ...mergedPayload, ...data, availability: 'online' };
                    
                    if (mergedPayload.state === 'OFFLINE' || mergedPayload.state === 'offline') {
                        delete mergedPayload.state;
                        if (data.state !== undefined) mergedPayload.state = data.state;
                    }
                }

                await pool.query(`
                    INSERT INTO telemetry (time, device_id, payload)
                    VALUES (CURRENT_TIMESTAMP, $1, $2)
                `, [deviceId, JSON.stringify(mergedPayload)]);

                const energyValue = data.energy ?? data.consumption ?? data.total_energy ?? data.energy_today;
                
                if (energyValue !== undefined) {
                    try {
                        await pool.query(`
                            INSERT INTO energy_readings (device_name, value, timestamp) 
                            VALUES ($1, $2, CURRENT_TIMESTAMP)
                        `, [friendlyName, energyValue]);
                    } catch (err) {
                        console.error(`Błąd zapisu energii (kWh) do bazy:`, err);
                    }
                }

                if (isAvailability) {
                    console.log(`[Availability] Device [${friendlyName}] is now ${mergedPayload.availability}`);
                }
                
                emitDeviceState(friendlyName, mergedPayload);

                // =====================================
                // WERYFIKACJA AUTOMATYZACJI NA ŻYWO (State-based triggers)
                // =====================================
                if (!isAvailability && deviceAutomations[friendlyName]) {
                    deviceAutomations[friendlyName].forEach(a => {
                        const { property, value } = a.trigger_config || {};
                        // Zabezpieczenie: Sprawdzamy tylko nowe "data", a nie pełny "mergedPayload",
                        // aby uniknąć pętli dla stanów, które nie uległy zmianie w tej wiadomości
                        if (data[property] !== undefined && String(data[property]) === String(value)) {
                            executeAutomation(a);
                        }
                    });
                }
            }
        } catch (error) {
            console.error(`Error processing message: ${topic}`, error);
        }
    });
};

start();