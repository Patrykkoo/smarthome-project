import { useState, useEffect } from 'react';

// Współdzielony, trwały stan aktualnie aktywnej sceny.
// Przechowujemy ID sceny w localStorage, aby podświetlenie "Active"
// utrzymywało się między zakładkami (Dashboard <-> Scenes) oraz po odświeżeniu.
// Synchronizacja między komponentami odbywa się przez zdarzenie okna
// (wzorzec taki sam jak 'user_settings_changed'), a między kartami przez 'storage'.

const STORAGE_KEY = 'smartify_active_scene';
const EVENT_NAME = 'active_scene_changed';

const readActiveScene = (): number | null => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null || raw === '') return null;
  const id = Number(raw);
  return Number.isNaN(id) ? null : id;
};

export const useActiveScene = () => {
  const [activeSceneId, setActiveSceneIdState] = useState<number | null>(readActiveScene);

  useEffect(() => {
    const sync = () => setActiveSceneIdState(readActiveScene());
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setActiveScene = (id: number | null) => {
    if (id === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, String(id));
    }
    setActiveSceneIdState(id);
    window.dispatchEvent(new Event(EVENT_NAME));
  };

  return { activeSceneId, setActiveScene };
};
