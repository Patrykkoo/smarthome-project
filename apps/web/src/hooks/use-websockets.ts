import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = 'http://192.168.0.66:3000';

export const useWebSockets = () => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('🟢 [WebSocket] Połączono z backendem!');
    });

    newSocket.on('device_state_update', (data) => {
      console.log(`📡 [WebSocket] Dane z ${data.friendlyName}:`, data.payload);
    });

    newSocket.on('device_list_updated', () => {
      console.log('🔄 [WebSocket] Lista urządzeń uległa zmianie (np. dodano nowe)');
    });

    newSocket.on('disconnect', () => {
      console.log('🔴 [WebSocket] Rozłączono z backendem.');
    });

    newSocket.on('connect_error', (err) => {
      console.error('❌ [WebSocket] Błąd połączenia:', err.message);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  return { socket };
};