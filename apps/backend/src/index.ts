import * as mqtt from 'mqtt';
import pool, { initDB } from './db';
import { startAPI, emitDeviceState, emitDevicesUpdated } from './api';

const start = async () => {
    await initDB();
    startAPI();

    const client = mqtt.connect('mqtt://localhost:1883');

    // W PĘTLI CO 60 SEKUND: Zapisujemy całkowity pobór mocy wszystkich urządzeń
    setInterval(async () => {
        try {
            // Szukamy najświeższego statusu każdego urządzenia zawierającego 'power'
            const result = await pool.query(`
                SELECT payload->>'power' as power 
                FROM (
                    SELECT DISTINCT ON (device_id) payload
                    FROM telemetry
                    WHERE payload ? 'power'
                    ORDER BY device_id, time DESC
                ) t
            `);
            
            // Sumujemy moc (W)
            const totalPower = result.rows.reduce((sum, row) => sum + (parseFloat(row.power) || 0), 0);
            
            // Zapisujemy punkt do wykresu
            await pool.query('INSERT INTO power_readings (total_power) VALUES ($1)', [totalPower]);
            
            // Usuwamy dane starsze niż 2 godziny, żeby zachować czystość w bazie
            await pool.query(`DELETE FROM power_readings WHERE timestamp < NOW() - INTERVAL '2 hours'`);
        } catch (error) {
            console.error('Błąd zapisu historii mocy:', error);
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

                if (data.energy !== undefined) {
                    try {
                        await pool.query(`
                            INSERT INTO energy_readings (device_name, value, timestamp) 
                            VALUES ($1, $2, CURRENT_TIMESTAMP)
                        `, [friendlyName, data.energy]);
                    } catch (err) {
                        console.error(`Błąd zapisu energii (kWh) do bazy:`, err);
                    }
                }

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