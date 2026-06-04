import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useWebSockets } from './use-websockets';
import { useDevices } from './use-devices';
import { useActiveScene } from './use-active-scene';

const API_URL = import.meta.env.VITE_API_URL;

// Tolerancje porównań dla wartości ciągłych (urządzenia raportują nieco
// inne liczby niż wysłane, dlatego nie wymagamy idealnej zgodności).
const TOLERANCE: Record<string, number> = {
  brightness: 12, // skala 0..254
  color_temp: 25, // miredy
};

const isOfflinePayload = (p: any) =>
  p?.state === 'OFFLINE' || p?.state === 'offline' || p?.availability === 'offline';

// Czy pojedyncza właściwość urządzenia nadal odpowiada temu, co ustawiła scena.
const valueMatches = (key: string, sceneVal: any, liveVal: any): boolean => {
  // Brak danych na żywo -> nie zrywamy sceny (zakładamy zgodność).
  if (liveVal === undefined || liveVal === null) return true;

  // color_mode to pole pomocnicze, nie traktujemy go jako "zerwania".
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
      // Hue jest kołowe (0..360).
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

  // Domyślnie porównanie po wartości (np. child_lock).
  return String(sceneVal) === String(liveVal);
};

// Czy scena nadal "obowiązuje": każde urządzenie wskazane w scenie wciąż
// ma stan zgodny z tym, co scena ustawiła. Urządzenia offline / bez danych pomijamy.
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

/**
 * Globalny strażnik aktywnej sceny.
 *
 * Pilnuje, czy scena oznaczona jako "Active" nadal obowiązuje. Gdy ktokolwiek
 * (na dowolnej stronie) zmieni urządzenie należące do sceny tak, że jego stan
 * przestaje pasować do tego, co scena ustawiła — znacznik "Active" jest czyszczony.
 *
 * Montowany raz w AppLayout, dzięki czemu działa niezależnie od bieżącego widoku.
 */
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

  // Żywa migawka stanów urządzeń: friendly_name -> scalony payload.
  const liveRef = useRef<Record<string, any>>({});
  // Okno karencji po aktywacji sceny – urządzenia potrzebują chwili na zastosowanie zmian.
  const graceUntilRef = useRef(0);
  const isFirstActivationEffect = useRef(true);

  // Refy z aktualnymi wartościami, by domknięcia w nasłuchach nie były nieświeże.
  const activeSceneIdRef = useRef<number | null>(activeSceneId);
  const scenesRef = useRef<any[]>(scenes);
  const setActiveSceneRef = useRef(setActiveScene);
  activeSceneIdRef.current = activeSceneId;
  scenesRef.current = scenes;
  setActiveSceneRef.current = setActiveScene;

  // Po każdej (świeżej) aktywacji sceny dajemy urządzeniom 5 s na reakcję.
  // Pomijamy pierwszy przebieg, by przywrócona z localStorage scena była
  // od razu zweryfikowana względem realnego stanu urządzeń.
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
    if (!scene) return; // Scena usunięta – czyszczeniem zajmuje się strona Scenes.

    if (!sceneStillHolds(scene.actions, liveRef.current)) {
      setActiveSceneRef.current(null);
    }
  };

  // Migawka z danych zapytania o urządzenia (start + każde odświeżenie listy).
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices]);

  // Reakcja na zmiany na żywo (Socket.IO).
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);
};
