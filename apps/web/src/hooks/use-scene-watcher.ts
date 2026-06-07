import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useWebSockets } from './use-websockets';
import { useDevices } from './use-devices';
import { useActiveScene } from './use-active-scene';

const API_URL = import.meta.env.VITE_API_URL;

const TOLERANCE: Record<string, number> = {
  brightness: 12,
  color_temp: 25,
};

const isOfflinePayload = (p: any) =>
  p?.state === 'OFFLINE' || p?.state === 'offline' || p?.availability === 'offline';

const valueMatches = (key: string, sceneVal: any, liveVal: any): boolean => {
  if (liveVal === undefined || liveVal === null) return true;
  if (key === 'color_mode') return true;

  if (key === 'state') {
    return String(liveVal).toUpperCase() === String(sceneVal).toUpperCase();
  }

  if (key === 'color') {
    if (sceneVal && typeof sceneVal === 'object' && liveVal && typeof liveVal === 'object') {
      const h1 = Number(sceneVal.h);
      const s1 = Number(sceneVal.s);
      const h2 = Number(liveVal.h);
      const s2 = Number(liveVal.s);
      if ([h1, s1, h2, s2].some(Number.isNaN)) return true;
      const dh = Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2));
      return dh <= 12 && Math.abs(s1 - s2) <= 12;
    }
    return true;
  }

  if (key in TOLERANCE) {
    const a = Number(sceneVal);
    const b = Number(liveVal);
    if (Number.isNaN(a) || Number.isNaN(b)) return String(sceneVal) === String(liveVal);
    return Math.abs(a - b) <= TOLERANCE[key];
  }

  return String(sceneVal) === String(liveVal);
};

const sceneStillHolds = (actions: any[], live: Record<string, any>): boolean => {
  for (const action of actions || []) {
    const payload = action?.payload;
    const name = action?.friendly_name;
    if (!payload || !name) continue;

    const state = live[name];
    if (!state || isOfflinePayload(state)) continue;

    for (const [key, sceneVal] of Object.entries(payload)) {
      if (!valueMatches(key, sceneVal, state[key])) return false;
    }
  }
  return true;
};

export const useSceneWatcher = () => {
  const { socket } = useWebSockets();
  const { data: devices = [] } = useDevices();
  const { activeSceneId, setActiveScene } = useActiveScene();

  const { data: scenes = [] } = useQuery({
    queryKey: ['scenes'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/scenes`);
      return res.data;
    },
  });

  const liveRef = useRef<Record<string, any>>({});
  const graceUntilRef = useRef(0);
  const isFirstActivationEffect = useRef(true);

  const activeSceneIdRef = useRef<number | null>(activeSceneId);
  const scenesRef = useRef<any[]>(scenes);
  const setActiveSceneRef = useRef(setActiveScene);
  activeSceneIdRef.current = activeSceneId;
  scenesRef.current = scenes;
  setActiveSceneRef.current = setActiveScene;

  useEffect(() => {
    if (isFirstActivationEffect.current) {
      isFirstActivationEffect.current = false;
      return;
    }
    if (activeSceneId !== null) graceUntilRef.current = Date.now() + 5000;
  }, [activeSceneId]);

  const evaluate = () => {
    const id = activeSceneIdRef.current;
    if (id === null) return;
    if (Date.now() < graceUntilRef.current) return;

    const scene = scenesRef.current.find((s: any) => s.id === id);
    if (!scene) return;

    if (!sceneStillHolds(scene.actions, liveRef.current)) {
      setActiveSceneRef.current(null);
    }
  };

  useEffect(() => {
    devices.forEach((d: any) => {
      if (d.last_payload) {
        liveRef.current[d.friendly_name] = {
          ...liveRef.current[d.friendly_name],
          ...d.last_payload,
        };
      }
    });
    evaluate();
  }, [devices]);

  useEffect(() => {
    if (!socket) return;
    const handleUpdate = (data: any) => {
      liveRef.current[data.friendlyName] = {
        ...liveRef.current[data.friendlyName],
        ...data.payload,
      };
      evaluate();
    };
    socket.on('device_state_update', handleUpdate);
    return () => {
      socket.off('device_state_update', handleUpdate);
    };
  }, [socket]);
};
