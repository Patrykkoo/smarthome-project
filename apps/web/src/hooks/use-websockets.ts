import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_WS_URL;

export const useWebSockets = () => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('[WebSocket] Connected to backend');
    });

    newSocket.on('device_state_update', (data) => {
      console.log(`[WebSocket] Data from ${data.friendlyName}:`, data.payload);
    });

    newSocket.on('device_list_updated', () => {
      console.log('[WebSocket] Device list has been updated');
    });

    newSocket.on('disconnect', () => {
      console.log('[WebSocket] Disconnected from backend');
    });

    newSocket.on('connect_error', (err) => {
      console.error('[WebSocket] Connection error:', err.message);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  return { socket };
};