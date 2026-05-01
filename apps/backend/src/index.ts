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
            const data = JSON.parse(rawPayload);
            
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

            // --- NOWA LOGIKA NAZW I DOSTĘPNOŚCI ---
            let friendlyName = topic.replace('zigbee2mqtt/', '');
            let isAvailability = false;

            // Jeśli to wiadomość o braku połączenia, obcinamy końcówkę "/availability"
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
                
                // Jeśli to tylko status offline/online, wysyłamy na front i kończymy
                if (isAvailability) {
                    // Zigbee2MQTT na temacie availability wysyła najczęściej {"state": "offline"}
                    emitDeviceState(friendlyName, { availability: data.state });
                    return; 
                }

                // Standardowy zapis pomiarów (telemetrii)
                const payloadJson = JSON.stringify(data);

                await pool.query(`
                    INSERT INTO telemetry (time, device_id, payload)
                    VALUES (CURRENT_TIMESTAMP, $1, $2)
                    `, [deviceId, payloadJson]);

                console.log(`Telemetry saved for [${friendlyName}].`);
                
                emitDeviceState(friendlyName, data);
            }
        } catch (error) {
            console.error(`Error processing message: ${topic}`, error);
        }
    });
};

start();