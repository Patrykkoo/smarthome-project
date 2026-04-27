import { useEffect, useState } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';

const SERVER_URL = 'http://192.168.0.66:3000';
const API_URL = `${SERVER_URL}/api`;

const socket = io(SERVER_URL);

interface Device {
  id: string;
  friendly_name: string;
  last_seen: string;
  exposes: any; 
}

function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [liveData, setLiveData] = useState<Record<string, any>>({});
  const [isPairing, setIsPairing] = useState<boolean>(false);
  const [pairingTimeLeft, setPairingTimeLeft] = useState<number>(0);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isPairing && pairingTimeLeft > 0) {
      timer = setInterval(() => {
        setPairingTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (pairingTimeLeft === 0 && isPairing) {
      setIsPairing(false);
    }
    return () => clearInterval(timer);
  }, [isPairing, pairingTimeLeft]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  useEffect(() => {
    fetchDevices();

    socket.on('device_state_update', (data) => {
      console.log('New data from WebSockets:', data);

      const decodedName = decodeURIComponent(data.friendlyName);
      const encodedName = encodeURIComponent(data.friendlyName);

      setLiveData((prevData) => ({
        ...prevData,
        [decodedName]: {
          ...prevData[decodedName],
          ...data.payload
        },
        [encodedName]: {
          ...prevData[encodedName],
          ...data.payload
        }
      }));
    });

    socket.on('device_list_updated', () => {
      console.log('Device list updated, fetching new data.');
      fetchDevices();
    });

    return () => {
      socket.off('device_state_update');
      socket.off('device_list_update');
    };
  }, []);

  const fetchDevices = async () => {
    try {
      const response = await axios.get(`${API_URL}/devices`);
      const devicesFromDB = response.data;
      setDevices(devicesFromDB);

      const initialLiveData: Record<string, any> = {};

      devicesFromDB.forEach((dev: any) => {
        if (dev.last_payload) {
          const decoded = decodeURIComponent(dev.friendly_name);
          const encoded = encodeURIComponent(dev.friendly_name);

          initialLiveData[decoded] = dev.last_payload;
          initialLiveData[encoded] = dev.last_payload;
        }
      });

      setLiveData(initialLiveData);
    } catch (error) {
      console.error('Error fetching devices:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleDevice = async (friendlyName: string) => {
    try {
      await axios.post(`${API_URL}/devices/${friendlyName}/set`, {
        state: 'TOGGLE'
      });
      console.log(`Command sent to: ${friendlyName}`);
    } catch (error) {
      console.error(`Failed to control ${friendlyName}:`, error);
      alert('Failed to sent command!');
    }
  };

  const togglePermitJoin = async (permit: boolean) => {
    try {
      await axios.post(`${API_URL}/bridge/permit_join`, { permit });
      
      setIsPairing(permit);
      if (permit) {
        setPairingTimeLeft(180);
      } else {
        setPairingTimeLeft(0);
      }
    } catch (error) {
      console.error('Failed to change pairing mode:', error);
      alert('Błąd API. Nie udało się zmienić trybu.');
    }
  };

  const removeDevice = async (friendlyName: string) => {
    const isConfirmed = window.confirm(`Czy na pewno chcesz usunąć urządzenie: ${friendlyName}?`);
    
    if (!isConfirmed) return;

    try {
      await axios.delete(`${API_URL}/devices/${friendlyName}`);
    } catch (error) {
      console.error(`Deleting device error ${friendlyName}:`, error);
      alert('Nie udało się usunąć urządzenia.');
    }
  };

  const renameDevice = async (oldName: string) => {
    const newName = window.prompt(`Podaj nową nazwę dla urządzenia: ${oldName}`, oldName);
    
    if (!newName || newName.trim() === '' || newName === oldName) return;

    try {
      await axios.put(`${API_URL}/devices/${oldName}/rename`, { new_name: newName.trim() });
    } catch (error) {
      console.error(`Error while changing device name from ${oldName} to ${newName}:`, error);
      alert('Nie udało się zmienić nazwy urządzenia.');
    }
  };

  const renderDeviceCapabilities = (device: Device) => {
    if (!device.exposes) return null;

    let exposesArray: any[] = [];
    try {
      const parsed = typeof device.exposes === 'string' ? JSON.parse(device.exposes) : device.exposes;
      exposesArray = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return null;
    }

    const allFeatures: any[] = [];
    exposesArray.forEach(item => {
      if (item.features) allFeatures.push(...item.features);
      else allFeatures.push(item);
    });

    if (allFeatures.length === 0) return null

    const currentDeviceData = liveData[device.friendly_name] || {};

    return (
      <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {allFeatures.map((feature, index) => {
          
          // 1. ZWYKŁY PRZEŁĄCZNIK (Włącznik prądu / Żarówka)
          if (feature.type === 'binary' && feature.name === 'state') {
            const isOnaNow = currentDeviceData.state === feature.value_on;
            return (
              <button 
                key={`${device.id}-btn-${index}`}
                onClick={() => toggleDevice(device.friendly_name)}
                style={{
                  padding: '0.5rem',
                  backgroundColor: isOnaNow ? '#28a745' : '#007BFF',
                  color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold',
                  transition: 'background-color 0.3s'
                }}
              >
                {isOnaNow ? 'WŁĄCZONE' : 'WYŁĄCZONE'}
              </button>
            );
          }

          // 2. WARTOŚĆ LICZBOWA (Temperatura, wilgotność, jasność, bateria)
          if (feature.type === 'numeric') {
            const value = currentDeviceData[feature.property] !== undefined 
                          ? currentDeviceData[feature.property] 
                          : '--';

            return (
              <div key={`${device.id}-num-${index}`} style={{ fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #eee', paddingBottom: '2px' }}>
                <span style={{ fontWeight: '500', textTransform: 'capitalize' }}>{feature.name.replace('_', ' ')}</span>
                <span style={{ color: value !== '--' ? '#000' : '#aaa', fontWeight: value !== '--' ? 'bold' : 'normal' }}>
                  {value} {feature.unit || ''}
                </span>
              </div>
            );
          }

          // 3. STAN LOGICZNY (Czujnik otwarcia)
          if (feature.type === 'binary' && feature.name !== 'state') {
            const value = currentDeviceData[feature.property];
            let displayValue = '--';
            if (value !== undefined) {
              displayValue = value ? 'ZAMKNIĘTE' : 'OTWARTE';
            }

            return (
              <div key={`${device.id}-bin-${index}`} style={{ fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #eee', paddingBottom: '2px' }}>
                <span style={{ fontWeight: '500', textTransform: 'capitalize' }}>{feature.name.replace('_', ' ')}</span>
                <span style={{ color: value !== undefined ? '#d9534f' : '#aaa', fontWeight: value !== undefined ? 'bold' : 'normal' }}>
                  {displayValue}
                </span>
              </div>
            );
          }

          // Inne typy (np. enum do wyboru trybu)
          return null;
        })}
      </div>
    );
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', backgroundColor: '#f4f4f9', minHeight: '100vh' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ color: '#333', margin: 0 }}>Smart Home <span style={{fontSize: '1rem', color: 'green'}}>● Połączono z bazą</span></h1>
        
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {isPairing ? (
            <button 
              onClick={() => togglePermitJoin(false)}
              style={{ padding: '0.6rem 1rem', backgroundColor: '#dc3545', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.6rem' }}
            >
              Zamknij sieć
              <span style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.85rem' }}>
                {formatTime(pairingTimeLeft)}
              </span>
            </button>
          ) : (
            <button 
              onClick={() => togglePermitJoin(true)}
              style={{ padding: '0.6rem 1rem', backgroundColor: '#ffc107', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Włącz parowanie
            </button>
          )}
        </div>
      </div>
      
      {loading ? (
        <p>Ładowanie urządzeń...</p>
      ) : (
        <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {devices.map((device) => (
            <div key={device.id} style={{ backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => renameDevice(device.friendly_name)}
                  title="Change device name"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '1.2rem', opacity: 0.6, transition: 'opacity 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseOut={(e) => e.currentTarget.style.opacity = '0.6'}
                >
                  ✏️
                </button>
                <button
                  onClick={() => removeDevice(device.friendly_name)}
                  title="Delete device"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '1.2rem', opacity: 0.6, transition: 'opacity 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseOut={(e) => e.currentTarget.style.opacity = '0.6'}
                >
                  🗑️
                </button>
              </div>
              <h3 style={{ margin: '0 0 0.5rem 0', color: '#222' }}>{device.friendly_name}</h3>
              <p style={{ fontSize: '0.75rem', color: '#888', margin: '0 0 1rem 0' }}>
                ID: {device.id} <br/>
                Ostatnia aktywność: {new Date(device.last_seen).toLocaleString()}
              </p>
              {renderDeviceCapabilities(device)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;