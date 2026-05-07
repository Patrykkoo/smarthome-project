import * as mqtt from 'mqtt';
import pool, { initDB } from './db';
import { startAPI, emitDeviceState, emitDevicesUpdated } from './api';

const start = async () => {
    await initDB();
    startAPI();

    const client = mqtt.connect('mqtt://localhost:1883');

    client.on('connect', () => {
        console.log('Connected with MQTT');
        client.subscribe('zigbee2mqtt/bridge/devices')
        client.subscribe('zigbee2mqtt/#');
    });

    client.on('message', async (topic, message) => {
        try {
            const rawPayload = message.toString();
            let data: any;
            
            // 1. Bezpieczne parsowanie (Z2M często wysyła plain text dla availability)
            try {
                data = JSON.parse(rawPayload);
            } catch (e) {
                data = { state: rawPayload };
            }
            
            // Dynamiczne wykrywanie urządzeń
            if (topic === 'zigbee2mqtt/bridge/devices') {
                for (const device of data) {
                    if (device.type === 'Coordinator') continue;

                    const id = device.ieee_address;
                    const friendlyName = device.friendly_name;
                    const exposes = JSON.stringify(device.definition?.exposes || []);

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
                return;
            }

            if (topic.startsWith('zigbee2mqtt/bridge')) return;

            // 2. Analiza tematu (czy to główny temat czy /availability)
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
                
                // 3. Pobranie ostatniej telemetrii, by nie zgubić danych (np. czy to gniazdko)
                const lastTelemetry = await pool.query(`
                    SELECT payload FROM telemetry WHERE device_id = $1 ORDER BY time DESC LIMIT 1
                `, [deviceId]);
                
                // pg automatycznie parsuje typ JSONB do obiektu
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
                    
                    // Czyszczenie fałszywego statusu offline jeśli urządzenie wysłało nowy payload
                    if (mergedPayload.state === 'OFFLINE' || mergedPayload.state === 'offline') {
                        delete mergedPayload.state;
                        // Przywrócenie payloadu do poprzedniego stanu
                        if (data.state !== undefined) mergedPayload.state = data.state;
                    }
                }

                // 4. Zapis połączonego payloadu
                await pool.query(`
                    INSERT INTO telemetry (time, device_id, payload)
                    VALUES (CURRENT_TIMESTAMP, $1, $2)
                `, [deviceId, JSON.stringify(mergedPayload)]);

                if (isAvailability) {
                    console.log(`[Availability] Device [${friendlyName}] is now ${mergedPayload.availability}`);
                }
                
                emitDeviceState(friendlyName, mergedPayload);
            }
        } catch (error) {
            console.error(`Error processing message: ${topic}`, error);
        }
    });
};

start();