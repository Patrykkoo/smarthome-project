import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { 
  Lightbulb, LayoutGrid, Pencil, Trash2, Thermometer, Sun, Palette, Sparkles, Signal,
  Plug, Lock, Unlock, Timer, Zap, Activity, BatteryCharging, Minus, Plus, WifiOff,
  ShieldCheck, ShieldAlert, Battery, BatteryLow, Droplets, PlusCircle, HelpCircle
} from "lucide-react";
import { GlassCard } from "@/components/livora/GlassCard";
import { DeviceTile } from "@/components/livora/DeviceTile";
import { ColorWheel } from "@/components/livora/ColorWheel";
import { cn } from "@/lib/utils";
import { useDevices } from "@/hooks/use-devices";
import { useWebSockets } from "@/hooks/use-websockets";
import axios from "axios";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { hexToHsl, hslToHex, kelvinToHex } from "@/lib/color";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const API_URL = import.meta.env.VITE_API_URL;

const effectNames: Record<string, string> = {
  none: "None", blink: "Blink", breathe: "Breathe", channel_change: "Signal flash", colorloop: "Color loop"
};

const lightStatusLabel = (isOn: boolean, brightness: number, colorMode: string, kelvin?: number, hexColor?: string) => {
  if (!isOn) return "Off";
  let mode = "Custom";
  
  if (colorMode === "color_temp" || (kelvin && colorMode !== "hs" && colorMode !== "xy")) {
    if (kelvin != null) {
      mode = kelvin >= 4500 ? "Cold" : kelvin >= 3000 ? "Neutral" : "Warm";
    }
  } else if (hexColor) {
    const { s, l } = hexToHsl(hexColor);
    if (s < 12 || l > 92) mode = "White";
  }
  
  return `${mode} · ${brightness}%`;
};

// ==============================================================
// LOGIKA ROZPOZNAWANIA TYPÓW (Feature Detection by Exposes)
// ==============================================================
type DeviceCategory = 'light' | 'plug' | 'sensor_contact' | 'sensor_leak' | 'sensor_climate' | 'unknown';

// Inteligentna funkcja sprawdzająca czy urządzenie obsługuje daną funkcję
const hasFeature = (device: any, liveData: any, property: string | string[]) => {
  if (!device) return false;
  const props = Array.isArray(property) ? property : [property];
  
  // 1. Szukamy w aktualnym payloadzie
  if (props.some(p => liveData[p] !== undefined)) return true;
  
  // 2. Szukamy w deklaracji możliwości urządzenia (exposes)
  try {
    const exposesStr = typeof device.exposes === 'string' ? device.exposes : JSON.stringify(device.exposes || {});
    return props.some(p => exposesStr.includes(`"property":"${p}"`));
  } catch {
    return false;
  }
};

const getDeviceCategory = (device: any, payload: any): DeviceCategory => {
  if (hasFeature(device, payload, 'water_leak')) return 'sensor_leak';
  if (hasFeature(device, payload, ['contact', 'tamper'])) return 'sensor_contact';
  
  if (hasFeature(device, payload, 'temperature') && !hasFeature(device, payload, 'current_heating_setpoint')) return 'sensor_climate';
  if (hasFeature(device, payload, ['brightness', 'color_temp', 'color'])) return 'light';
  if (hasFeature(device, payload, ['power', 'energy', 'consumption', 'energy_today', 'current', 'voltage'])) return 'plug';
  if (hasFeature(device, payload, 'state')) return 'plug';
  
  return 'unknown';
};

const normalizeEnergyData = (payload: any) => {
  return Number(payload.energy ?? payload.consumption ?? payload.total_energy ?? payload.energy_today ?? 0).toFixed(2);
};

const Devices = () => {
  const { data: devices = [], isLoading: isLoadingDevices } = useDevices();
  const [searchParams] = useSearchParams();
  const selectParam = searchParams.get('select');
  
  const { data: rooms = [], isLoading: isLoadingRooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/rooms`);
      return res.data;
    }
  });

  const { socket } = useWebSockets();
  const queryClient = useQueryClient();
  
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [localLiveData, setLocalLiveData] = useState<Record<string, any>>({});
  
  const [deviceToRename, setDeviceToRename] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [deviceToDelete, setDeviceToDelete] = useState<string | null>(null);
  
  const [isAddRoomOpen, setIsAddRoomOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [roomToDelete, setRoomToDelete] = useState<{id: number, name: string} | null>(null);

  const [selectedDevice, setSelectedDevice] = useState<any | null>(null);
  
  const [deviceEffects, setDeviceEffects] = useState<Record<string, string>>({});
  const [preEffectState, setPreEffectState] = useState<Record<string, any>>({});

  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [wheelCache, setWheelCache] = useState<Record<string, {h: number, s: number}>>({});

  useEffect(() => {
    if (selectParam && devices.length > 0) {
      const deviceToSelect = devices.find((d: any) => d.friendly_name === selectParam);
      if (deviceToSelect) {
        setSelectedDevice(deviceToSelect);
        if (deviceToSelect.room_id) setActiveRoomId(deviceToSelect.room_id);
        else setActiveRoomId(null);
      }
    }
  }, [selectParam, devices]);

  useEffect(() => {
    if (!socket) return;
    socket.on('device_state_update', (data: any) => {
      setLocalLiveData(prev => {
        const current = prev[data.friendlyName] || {};
        const incoming = { ...data.payload };
        
        if (incoming.countdown !== undefined) {
          if (incoming.countdown === current.originalCountdown && current.countdown > 0) {
            incoming.countdown = current.countdown; 
          } else {
            incoming.originalCountdown = incoming.countdown;
            if (incoming.countdown > 0) sessionStorage.setItem(`countdown_ends_at_${data.friendlyName}`, (Date.now() + incoming.countdown * 1000).toString());
            else sessionStorage.removeItem(`countdown_ends_at_${data.friendlyName}`);
          }
        }
        
        return {
          ...prev,
          [data.friendlyName]: { ...current, ...incoming }
        };
      });

      queryClient.setQueryData(['devices'], (oldData: any) => {
        if (!oldData) return oldData;
        return oldData.map((d: any) => 
          d.friendly_name === data.friendlyName 
            ? { ...d, last_payload: { ...d.last_payload, ...data.payload } } 
            : d
        );
      });
    });
    
    socket.on('device_list_updated', () => queryClient.invalidateQueries({ queryKey: ['devices'] }));
    return () => { 
      socket.off('device_state_update'); 
      socket.off('device_list_updated');
    };
  }, [socket, queryClient]);

  useEffect(() => {
    if (devices.length > 0) {
      setLocalLiveData(prev => {
        let hasChanges = false;
        const next = { ...prev };
        devices.forEach(d => {
          if (d.last_payload && !next[d.friendly_name]) {
            const payload = { ...d.last_payload };
            
            const savedEnd = sessionStorage.getItem(`countdown_ends_at_${d.friendly_name}`);
            if (savedEnd && payload.countdown > 0) {
              const remaining = Math.round((parseInt(savedEnd) - Date.now()) / 1000);
              if (remaining > 0) {
                payload.countdown = remaining;
                payload.originalCountdown = d.last_payload.countdown;
              } else {
                payload.countdown = 0;
                sessionStorage.removeItem(`countdown_ends_at_${d.friendly_name}`);
              }
            }
            
            next[d.friendly_name] = payload;
            hasChanges = true;
          }
        });
        return hasChanges ? next : prev;
      });
    }
  }, [devices]);

  useEffect(() => {
    const id = setInterval(() => {
      setLocalLiveData(prev => {
        let hasChanges = false;
        const next = { ...prev };
        Object.keys(next).forEach(key => {
          if (next[key]?.countdown > 0) {
            next[key] = { ...next[key], countdown: Math.max(0, next[key].countdown - 1) };
            hasChanges = true;
          }
        });
        return hasChanges ? next : prev;
      });
    }, 1000); 
    
    return () => clearInterval(id);
  }, []);

  const sendCommand = async (friendlyName: string, payload: any) => {
    try {
      await axios.post(`${API_URL}/devices/${friendlyName}/set`, payload);
    } catch (error) {
      toast.error(`Błąd sterowania: ${friendlyName}`);
    }
  };

  const sendCommandOptimistic = (friendlyName: string, payload: any) => {
    setLocalLiveData(prev => {
      const current = prev[friendlyName] || {};
      const newPayload = { ...payload };

      if (newPayload.countdown !== undefined) {
        newPayload.originalCountdown = newPayload.countdown;
        if (newPayload.countdown > 0) {
          sessionStorage.setItem(`countdown_ends_at_${friendlyName}`, (Date.now() + newPayload.countdown * 1000).toString());
        } else {
          sessionStorage.removeItem(`countdown_ends_at_${friendlyName}`);
        }
      }
      
      // Zabezpieczenie dla obiektów zagnieżdżonych (jak inching_control_set)
      if (payload.inching_control_set && current.inching_control_set) {
        newPayload.inching_control_set = { ...current.inching_control_set, ...payload.inching_control_set };
      }
      
      return { ...prev, [friendlyName]: { ...current, ...newPayload } };
    });

    queryClient.setQueryData(['devices'], (oldData: any) => {
      if (!oldData) return oldData;
      return oldData.map((d: any) => 
        d.friendly_name === friendlyName 
          ? { ...d, last_payload: { ...d.last_payload, ...payload } } 
          : d
      );
    });

    const key = `${friendlyName}_cmd`;
    if (debounceRefs.current[key]) clearTimeout(debounceRefs.current[key]);

    debounceRefs.current[key] = setTimeout(() => {
      sendCommand(friendlyName, payload);
    }, 250);
  };

  const handleToggle = (friendlyName: string) => {
    const key = `${friendlyName}_cmd`;
    if (debounceRefs.current[key]) clearTimeout(debounceRefs.current[key]);

    let newState = "ON";

    setLocalLiveData(prev => {
      const current = prev[friendlyName] || {};
      newState = current.state === "ON" ? "OFF" : "ON";
      return { ...prev, [friendlyName]: { ...current, state: newState } };
    });

    queryClient.setQueryData(['devices'], (oldData: any) => {
      if (!oldData) return oldData;
      return oldData.map((d: any) => 
        d.friendly_name === friendlyName 
          ? { ...d, last_payload: { ...d.last_payload, state: newState } } 
          : d
      );
    });

    debounceRefs.current[key] = setTimeout(() => {
      axios.post(`${API_URL}/devices/${friendlyName}/set`, { state: 'TOGGLE' })
        .catch(() => toast.error(`Błąd sterowania: ${friendlyName}`));
    }, 250);
  };

  const handleDelete = async (friendlyName: string) => {
    try {
      await axios.delete(`${API_URL}/devices/${friendlyName}`);
      toast.success("Urządzenie zostało usunięte");
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      if (selectedDevice?.friendly_name === friendlyName) setSelectedDevice(null);
    } catch (error) {
      toast.error("Nie udało się usunąć urządzenia");
    }
  };

  const handleRename = async (oldName: string, updatedName: string) => {
    const finalName = updatedName.trim();
    if (oldName === finalName || !finalName) return;
    
    try {
      window.dispatchEvent(new CustomEvent('ignore_offline', { detail: oldName }));

      setLocalLiveData(prev => {
        const next = { ...prev };
        if (next[oldName]) {
          next[finalName] = { ...next[oldName] };
        }
        return next;
      });

      await axios.put(`${API_URL}/devices/${oldName}/rename`, { new_name: finalName });
      toast.success("Zmieniono nazwę urządzenia");
      
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      
      if (selectedDevice && selectedDevice.friendly_name === oldName) {
         setSelectedDevice({ ...selectedDevice, friendly_name: finalName });
      }
    } catch (error) {
      toast.error("Nie udało się zmienić nazwy urządzenia");
    }
  };

  const handleAddRoom = async () => {
    if (!newRoomName.trim()) return;
    try {
      await axios.post(`${API_URL}/rooms`, { name: newRoomName.trim() });
      toast.success("Room created successfully");
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      setIsAddRoomOpen(false);
      setNewRoomName("");
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Failed to create room");
    }
  };

  const handleDeleteRoom = async (id: number) => {
    try {
      await axios.delete(`${API_URL}/rooms/${id}`);
      toast.success("Room deleted");
      if (activeRoomId === id) setActiveRoomId(null);
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    } catch (error) {
      toast.error("Failed to delete room");
    }
  };

  const handleAssignRoom = async (friendlyName: string, roomId: number | null) => {
    try {
      await axios.put(`${API_URL}/devices/${friendlyName}/room`, { room_id: roomId });
      toast.success("Room assigned");
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      
      if (selectedDevice && selectedDevice.friendly_name === friendlyName) {
         const assignedRoom = rooms.find((r: any) => r.id === roomId);
         setSelectedDevice({ 
           ...selectedDevice, 
           room_id: roomId, 
           room_name: assignedRoom ? assignedRoom.name : null 
         });
      }
    } catch (error) {
      toast.error("Failed to assign room");
    }
  };

  const roomCounts = devices.reduce((acc: any, d: any) => {
    const rId = d.room_id || 'unassigned';
    acc[rId] = (acc[rId] || 0) + 1;
    return acc;
  }, {});

  const displayRooms = [
    { id: null, name: "All", count: devices.length },
    ...rooms.map((r: any) => ({ ...r, count: roomCounts[r.id] || 0 }))
  ];

  const filteredDevices = activeRoomId === null 
    ? devices 
    : devices.filter((d: any) => d.room_id === activeRoomId);

  const selectedData = selectedDevice ? (localLiveData[selectedDevice.friendly_name] || {}) : {};
  const isSelectedOffline = selectedData.state === 'OFFLINE' || selectedData.state === 'offline' || selectedData.availability === 'offline';
  
  const selectedCategory = getDeviceCategory(selectedDevice, selectedData);
  const isOn = (selectedCategory === 'sensor_contact' || selectedCategory === 'sensor_leak' || selectedCategory === 'sensor_climate') ? !isSelectedOffline : (selectedData.state === "ON" && !isSelectedOffline);

  let currentHexColor = "#FFFFFF";
  let currentKelvin = 4000;
  
  if (selectedCategory === 'light' && !isSelectedOffline) {
    if (selectedData.color_mode === "color_temp" || (selectedData.color_temp && !selectedData.color)) {
      currentKelvin = Math.round(1000000 / selectedData.color_temp);
      currentHexColor = kelvinToHex(currentKelvin);
    } else if (selectedData.color && selectedData.color.h !== undefined) {
      currentHexColor = hslToHex(selectedData.color.h, selectedData.color.s || 100, 50);
    } else if (selectedDevice && wheelCache[selectedDevice.friendly_name]) {
      const cached = wheelCache[selectedDevice.friendly_name];
      currentHexColor = hslToHex(cached.h, cached.s, 50);
    }
  }

  const currentBrightnessPct = Math.round(((selectedData.brightness || 0) / 254) * 100);

  const wheelHue = selectedData.color?.h ?? (selectedDevice ? wheelCache[selectedDevice.friendly_name]?.h : 0) ?? 0;
  const wheelSat = selectedData.color_mode === "color_temp" 
    ? 0 
    : (selectedData.color?.s ?? (selectedDevice ? wheelCache[selectedDevice.friendly_name]?.s : 100) ?? 100);

  const currentEffect = selectedDevice ? (deviceEffects[selectedDevice.friendly_name] || "none") : "none";
  
  const selectedCountdownSec = selectedData.countdown || 0;
  const selectedCountdownMins = Math.ceil(selectedCountdownSec / 60);

  // Zmienne dla systemu Inching Sonoff
  const hasInching = hasFeature(selectedDevice, selectedData, ['inching_control_set', 'inching_control', 'inching']);
  // Pobieramy dane bezpiecznie (niektóre plugi dają płaskie obiekty, inne jak Sonoff złożone 'inching_control_set')
  const inchingStateObj = selectedData.inching_control_set || {};
  const isInchingEnabled = inchingStateObj.inching_control === "ENABLE" || selectedData.inching_control === "ENABLE" || selectedData.inching === "ON";
  const inchingTimeVal = inchingStateObj.inching_time || selectedData.inching_time || 0.5;
  const inchingModeVal = inchingStateObj.inching_mode || selectedData.inching_mode || "OFF";

  const formatRemaining = (sec: number) => {
    if (sec <= 0) return "Disabled";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
    return `${m}:${String(s).padStart(2, "0")}`; 
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Devices & Rooms</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage every connected device room by room.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_400px] gap-6">
        
        {/* KOLUMNA LEWA: POKOJE */}
        <GlassCard className="p-3 h-fit flex flex-col gap-2">
          <ul className="space-y-1">
            {displayRooms.map((r) => (
              <li key={r.id || 'all'}>
                <button
                  onClick={() => { setActiveRoomId(r.id); setSelectedDevice(null); }}
                  className={cn(
                    "w-full flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition-colors",
                    r.id === activeRoomId
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                      : "text-foreground/70 hover:text-foreground hover:bg-muted/60"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {r.id === null && <LayoutGrid className="h-4 w-4" />}
                    <span className="truncate max-w-[120px] text-left">{r.name}</span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <span className={cn("text-xs", r.id === activeRoomId ? "opacity-90" : "opacity-70")}>
                      {r.count}
                    </span>
                    
                    {r.id === activeRoomId && r.id !== null && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setRoomToDelete({ id: r.id, name: r.name });
                        }}
                        className="flex items-center justify-center p-1.5 -mr-1.5 rounded-lg bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <div className="pt-2 border-t border-border/40">
            <button
              onClick={() => setIsAddRoomOpen(true)}
              className="w-full flex items-center justify-start gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Add new room</span>
            </button>
          </div>
        </GlassCard>

        {/* KOLUMNA ŚRODKOWA: KAFELKI URZĄDZEŃ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 content-start">
          {isLoadingDevices || isLoadingRooms ? (
            <p className="col-span-2 text-center py-10 text-muted-foreground">Loading devices...</p>
          ) : filteredDevices.length === 0 ? (
            <p className="col-span-2 text-center py-10 text-muted-foreground">No devices found in this room.</p>
          ) : (
            filteredDevices.map((d) => {
              const dData = localLiveData[d.friendly_name] || {};
              const isOffline = dData.state === 'OFFLINE' || dData.state === 'offline' || dData.availability === 'offline';
              
              const category = getDeviceCategory(d, dData);
              const closed = dData.contact ?? true;
              
              const dIsOn = (category === 'sensor_contact' || category === 'sensor_leak' || category === 'sensor_climate') ? !isOffline : (dData.state === "ON" && !isOffline);

              let icon = HelpCircle;
              let statusLabel = "Off";
              let statusColor = undefined;
              let iconColor = undefined;
              let livePulse = false;
              let showSwitch = true;

              if (category === 'unknown') {
                icon = HelpCircle;
                statusLabel = "Unsupported";
                showSwitch = false;
              } else if (category === 'sensor_leak') {
                const leaked = dData.water_leak === true || dData.water_leak === "true";
                icon = Droplets;
                statusLabel = leaked ? "LEAK!" : "Dry";
                statusColor = leaked ? "#E5484D" : "#7FD4A1";
                livePulse = leaked;
                showSwitch = false;

              } else if (category === 'sensor_contact') {
                const tampered = dData.tamper === true || dData.tamper === "true";
                icon = tampered ? ShieldAlert : Lock;
                statusLabel = tampered ? "TAMPER!" : (closed ? "Closed" : "Open");
                statusColor = tampered ? "#E5484D" : (closed ? "#7FD4A1" : "#E5484D");
                livePulse = tampered;
                showSwitch = false;
                
              } else if (category === 'sensor_climate') {
                const temp = dData.temperature ?? 0;
                const hum = dData.humidity ?? 0;
                icon = Thermometer;
                statusLabel = dData.humidity !== undefined ? `${temp}°C · ${hum}%` : `${temp}°C`;
                statusColor = temp < 20 ? "#3B82F6" : "#F97316"; 
                livePulse = false;
                showSwitch = false;

              } else if (category === 'plug') {
                icon = Plug;
                livePulse = dIsOn && (dData.power > 0);
                
                if (!dIsOn) {
                  statusLabel = "Off";
                  livePulse = false;
                } else {
                  let parts = [];
                  if (dData.power !== undefined) parts.push(`${Math.round(dData.power)}W`);
                  if (dData.countdown && dData.countdown > 0) parts.push(`Timer: ${formatRemaining(dData.countdown)}`);
                  // Logika statusu dla Inching w karcie urządzenia
                  else if (hasFeature(d, dData, ['inching_control_set', 'inching_control', 'inching'])) {
                     const isInchOn = dData.inching_control_set?.inching_control === "ENABLE" || dData.inching_control === "ENABLE" || dData.inching === "ON";
                     if (isInchOn) parts.push(`Inching ON`);
                  }
                  
                  statusLabel = parts.length > 0 ? parts.join(" · ") : "On";
                }
              } else if (category === 'light') {
                icon = Lightbulb;
                let dKelvin = undefined;
                if (dData.color_mode === "color_temp" || (dData.color_temp && !dData.color)) {
                  dKelvin = Math.round(1000000 / dData.color_temp);
                  statusColor = kelvinToHex(dKelvin);
                } else if (dData.color && dData.color.h !== undefined) {
                  statusColor = hslToHex(dData.color.h, dData.color.s || 100, 50);
                } else if (wheelCache[d.friendly_name]) {
                  const cached = wheelCache[d.friendly_name];
                  statusColor = hslToHex(cached.h, cached.s, 50);
                } else if (dData.color_temp) {
                  dKelvin = Math.round(1000000 / dData.color_temp);
                  statusColor = kelvinToHex(dKelvin);
                }
                const brightnessPct = Math.round(((dData.brightness || 0) / 254) * 100);
                statusLabel = lightStatusLabel(dIsOn, brightnessPct, dData.color_mode, dKelvin, statusColor);
              }

              return (
                <DeviceTile
                  key={d.id}
                  icon={icon} 
                  name={d.friendly_name}
                  room={d.room_name || "Unassigned"}
                  livePulse={livePulse}
                  statusLabel={statusLabel}
                  statusColor={statusColor}
                  iconColor={iconColor}
                  enabled={dIsOn}
                  offline={isOffline}
                  showSwitch={showSwitch}
                  selected={selectedDevice?.id === d.id}
                  onClick={() => setSelectedDevice(d)} 
                  onToggle={(e: any) => {
                    if (e && e.stopPropagation) e.stopPropagation();
                    handleToggle(d.friendly_name);
                  }}
                />
              );
            })
          )}
        </div>

        {/* KOLUMNA PRAWA: SZCZEGÓŁY URZĄDZENIA */}
        {selectedDevice ? (
          <GlassCard variant="strong" className="p-6 h-fit space-y-6 flex flex-col">
            
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    {selectedDevice.room_name || "Unassigned"}
                  </p>
                  
                  {isSelectedOffline ? (
                    <div className="flex items-center gap-1 text-[10px] text-destructive font-bold bg-destructive/10 px-2 py-0.5 rounded-md uppercase tracking-wider">
                      <WifiOff className="h-3 w-3" />
                      <span>Offline</span>
                    </div>
                  ) : selectedData.linkquality !== undefined ? (
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium bg-muted/40 px-1.5 py-0.5 rounded-md">
                      <Signal className="h-3 w-3" />
                      <span>{selectedData.linkquality} LQI</span>
                    </div>
                  ) : null}
                </div>
                <h3 className="font-display text-2xl font-semibold truncate mt-1.5">{selectedDevice.friendly_name}</h3>
              </div>
              
              {selectedCategory !== 'sensor_contact' && selectedCategory !== 'sensor_leak' && selectedCategory !== 'sensor_climate' && selectedCategory !== 'unknown' && (
                <Switch
                  checked={isOn}
                  disabled={isSelectedOffline}
                  onCheckedChange={() => handleToggle(selectedDevice.friendly_name)}
                />
              )}
            </div>

            <div>
              {isSelectedOffline ? (
                <div className="py-10 flex flex-col items-center justify-center text-center bg-muted/20 rounded-3xl border border-border/40">
                  <div className="h-16 w-16 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-4">
                    <WifiOff className="h-8 w-8" />
                  </div>
                  <p className="text-lg font-semibold text-foreground">Connection failed</p>
                  <p className="text-sm text-muted-foreground mt-1 px-6">
                    Cannot connect to the device. Ensure it is within the Zigbee network range and powered on.
                  </p>
                </div>
              ) : selectedCategory === 'unknown' ? (
                <div className="py-10 flex flex-col items-center justify-center text-center bg-muted/20 rounded-3xl border border-border/40">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4 text-muted-foreground">
                    <HelpCircle className="h-8 w-8" />
                  </div>
                  <p className="text-lg font-semibold text-foreground">Unsupported Device</p>
                  <p className="text-sm text-muted-foreground mt-1 px-6">
                    This device type is not fully supported by the UI yet. You can still manage its room assignment or rename it below.
                  </p>
                </div>
              ) : selectedCategory === 'sensor_leak' ? (
                <div className="space-y-6">
                  {(() => {
                    const leaked = selectedData.water_leak === true || selectedData.water_leak === "true";
                    const heroColor = leaked ? "#E5484D" : "#7FD4A1";
                    
                    return (
                      <>
                        <div className="rounded-2xl p-8 flex flex-col items-center justify-center"
                          style={{ background: `radial-gradient(circle at 50% 50%, ${heroColor}30, ${heroColor}05 70%)` }}>
                          <div className="relative">
                            <Droplets className="h-20 w-20" strokeWidth={1.2} style={{ color: heroColor }} />
                            {leaked && (
                              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                                <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ backgroundColor: "#E5484D" }} />
                                <span className="relative inline-flex h-4 w-4 rounded-full" style={{ backgroundColor: "#E5484D" }} />
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className={cn("rounded-2xl border p-4 transition-colors", !leaked ? "bg-background/50 border-border/40" : "bg-destructive/5 border-destructive/30")}>
                            <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                              <Droplets className="h-3.5 w-3.5" /> Status
                            </div>
                            <p className={cn("mt-1 font-display text-lg font-semibold", !leaked ? "text-foreground" : "text-destructive")}>
                              {!leaked ? "Dry" : "LEAK!"}
                            </p>
                          </div>

                          {hasFeature(selectedDevice, selectedData, 'battery') && (
                            <div className={cn("rounded-2xl border p-4 transition-colors", Math.round(selectedData.battery) > 15 ? "bg-background/50 border-border/40" : "bg-destructive/5 border-destructive/30")}>
                              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                                {Math.round(selectedData.battery) > 15 ? <Battery className="h-3.5 w-3.5" /> : <BatteryLow className="h-3.5 w-3.5" />} Battery
                              </div>
                              <p className={cn("mt-1 font-display text-lg font-semibold", Math.round(selectedData.battery) > 15 ? "text-foreground" : "text-destructive")}>
                                {Math.round(selectedData.battery)}<span className="ml-0.5 text-xs font-medium text-muted-foreground">%</span>
                              </p>
                            </div>
                          )}
                        </div>

                        {hasFeature(selectedDevice, selectedData, 'water_leak') && (
                          <div className="pt-2">
                            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Test Alarm</p>
                            <div className="flex items-center justify-between rounded-2xl bg-background/50 border border-border/40 px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center", !leaked ? "bg-muted text-muted-foreground" : "bg-destructive text-primary-foreground")}>
                                  <Droplets className="h-4 w-4" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium">Simulate Leak</p>
                                  <p className="text-xs text-muted-foreground">Trigger fake alarm for testing</p>
                                </div>
                              </div>
                              <Switch checked={leaked} onCheckedChange={(v) => sendCommandOptimistic(selectedDevice.friendly_name, { water_leak: v })} />
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              ) : selectedCategory === 'sensor_contact' ? (
                <div className="space-y-6">
                  {(() => {
                    const closed = selectedData.contact ?? true;
                    const tampered = selectedData.tamper === true || selectedData.tamper === "true";
                    const HeroIcon = tampered ? ShieldAlert : closed ? Lock : Unlock;
                    const heroColor = tampered ? "#E5484D" : closed ? "#7FD4A1" : "#E5484D";
                    
                    return (
                      <div className="rounded-2xl p-8 flex flex-col items-center justify-center" style={{ background: `radial-gradient(circle at 50% 50%, ${heroColor}30, ${heroColor}05 70%)` }}>
                        <div className="relative">
                          <HeroIcon className="h-20 w-20" strokeWidth={1.2} style={{ color: heroColor }} />
                          {tampered && (
                            <span className="absolute -top-1 -right-1 flex h-4 w-4">
                              <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ backgroundColor: "#E5484D" }} />
                              <span className="relative inline-flex h-4 w-4 rounded-full" style={{ backgroundColor: "#E5484D" }} />
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {(() => {
                    const closed = selectedData.contact ?? true;
                    return (
                      <div className="grid grid-cols-2 gap-3">
                        {hasFeature(selectedDevice, selectedData, 'contact') && (
                          <div className={cn("rounded-2xl border p-4 transition-colors", closed ? "bg-background/50 border-border/40" : "bg-destructive/5 border-destructive/30")}>
                            <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                              {closed ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />} Contact
                            </div>
                            <p className={cn("mt-1 font-display text-lg font-semibold", closed ? "text-foreground" : "text-destructive")}>
                              {closed ? "Closed" : "Open"}
                            </p>
                          </div>
                        )}

                        {hasFeature(selectedDevice, selectedData, 'battery') && (
                          <div className={cn("rounded-2xl border p-4 transition-colors", Math.round(selectedData.battery) > 15 ? "bg-background/50 border-border/40" : "bg-destructive/5 border-destructive/30")}>
                            <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                              {Math.round(selectedData.battery) > 15 ? <Battery className="h-3.5 w-3.5" /> : <BatteryLow className="h-3.5 w-3.5" />} Battery
                            </div>
                            <p className={cn("mt-1 font-display text-lg font-semibold", Math.round(selectedData.battery) > 15 ? "text-foreground" : "text-destructive")}>
                              {Math.round(selectedData.battery)}<span className="ml-0.5 text-xs font-medium text-muted-foreground">%</span>
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {hasFeature(selectedDevice, selectedData, 'tamper') && (
                    <div className="pt-2">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Test Alarm</p>
                      <div className="flex items-center justify-between rounded-2xl bg-background/50 border border-border/40 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center", !(selectedData.tamper === true || selectedData.tamper === "true") ? "bg-muted text-muted-foreground" : "bg-destructive text-primary-foreground")}>
                            {!(selectedData.tamper === true || selectedData.tamper === "true") ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium">Simulate Tamper</p>
                            <p className="text-xs text-muted-foreground">Trigger fake alarm for testing</p>
                          </div>
                        </div>
                        <Switch checked={selectedData.tamper === true || selectedData.tamper === "true"} onCheckedChange={(v) => sendCommandOptimistic(selectedDevice.friendly_name, { tamper: v })} />
                      </div>
                    </div>
                  )}
                </div>
              ) : selectedCategory === 'sensor_climate' ? (
                <div className="space-y-6">
                  {(() => {
                    const temp = selectedData.temperature ?? 0;
                    const isCold = temp < 20;
                    const heroColor = isCold ? "#3b82f6" : "#f97316";
                    const glowFilter = isCold ? "drop-shadow(0 0 16px rgba(59, 130, 246, 0.5))" : "drop-shadow(0 0 16px rgba(249, 115, 22, 0.5))";

                    return (
                      <>
                        <div
                          className="rounded-2xl p-8 flex items-center justify-between transition-all duration-500 relative overflow-hidden"
                          style={{ background: `radial-gradient(circle at 85% 50%, ${heroColor}40 0%, ${heroColor}05 70%)` }}
                        >
                          <div className="relative z-10">
                            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Temperature</p>
                            <p className="mt-2 font-display text-5xl font-semibold text-foreground">
                              {temp}
                              <span className="ml-1 text-xl font-medium text-muted-foreground">°C</span>
                            </p>
                          </div>
                          <div className="relative z-10">
                            <Thermometer className="h-20 w-20 transition-all duration-500" strokeWidth={1.2} style={{ color: heroColor, filter: glowFilter }} />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                          {hasFeature(selectedDevice, selectedData, 'humidity') && (
                            <div className="rounded-2xl bg-background/50 border border-border/40 p-3 flex flex-col justify-center">
                              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap overflow-hidden">
                                <Droplets className="h-3 w-3 shrink-0" /> <span className="truncate">Humidity</span>
                              </div>
                              <p className="mt-1 font-display text-lg font-semibold truncate">
                                {selectedData.humidity}<span className="ml-1 text-[10px] font-medium text-muted-foreground">%</span>
                              </p>
                            </div>
                          )}
                          
                          {hasFeature(selectedDevice, selectedData, 'illuminance') && (
                            <div className="rounded-2xl bg-background/50 border border-border/40 p-3 flex flex-col justify-center">
                              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap overflow-hidden">
                                <Sun className="h-3 w-3 shrink-0" /> <span className="truncate">Illuminance</span>
                              </div>
                              <p className="mt-1 font-display text-lg font-semibold truncate">
                                {selectedData.illuminance}<span className="ml-1 text-[10px] font-medium text-muted-foreground">lx</span>
                              </p>
                            </div>
                          )}

                          {hasFeature(selectedDevice, selectedData, 'battery') && (
                            <div className={cn("rounded-2xl border p-3 flex flex-col justify-center", Math.round(selectedData.battery) > 15 ? "bg-background/50 border-border/40" : "bg-destructive/5 border-destructive/30")}>
                              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap overflow-hidden">
                                {Math.round(selectedData.battery) > 15 ? <Battery className="h-3 w-3 shrink-0" /> : <BatteryLow className="h-3 w-3 shrink-0" />} <span className="truncate">Battery</span>
                              </div>
                              <p className={cn("mt-1 font-display text-lg font-semibold truncate", Math.round(selectedData.battery) <= 15 && "text-destructive")}>
                                {Math.round(selectedData.battery)}<span className="ml-1 text-[10px] font-medium text-muted-foreground">%</span>
                              </p>
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : selectedCategory === 'plug' ? (
                <div className="space-y-6">
                  {hasFeature(selectedDevice, selectedData, 'power') && (
                    <div
                      className="rounded-2xl p-8 flex items-center justify-between transition-all duration-500 relative overflow-hidden"
                      style={{ background: isOn ? "radial-gradient(circle at 85% 50%, #3b82f640 0%, #3b82f605 70%)" : "hsl(var(--muted) / 0.4)" }}
                    >
                      <div className="relative z-10">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Power draw</p>
                        <p className="mt-2 font-display text-5xl font-semibold text-foreground">
                          {isOn ? Math.round(selectedData.power ?? 0) : 0}
                          <span className="ml-1 text-xl font-medium text-muted-foreground">W</span>
                        </p>
                      </div>
                      <div className="relative z-10">
                        <Plug className="h-20 w-20 transition-all duration-500" strokeWidth={1.2} style={{ color: isOn ? "#3b82f6" : "hsl(var(--muted-foreground))", filter: isOn ? "drop-shadow(0 0 16px rgba(59, 130, 246, 0.5))" : "none" }} />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2">
                    {hasFeature(selectedDevice, selectedData, 'current') && (
                      <div className="rounded-2xl bg-background/50 border border-border/40 p-3 flex flex-col justify-center">
                        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap overflow-hidden">
                          <Activity className="h-3 w-3 shrink-0" /> <span className="truncate">Current</span>
                        </div>
                        <p className="mt-1 font-display text-lg font-semibold truncate">
                          {selectedData.current} <span className="text-[10px] font-medium text-muted-foreground">A</span>
                        </p>
                      </div>
                    )}
                    {hasFeature(selectedDevice, selectedData, 'voltage') && (
                      <div className="rounded-2xl bg-background/50 border border-border/40 p-3 flex flex-col justify-center">
                        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap overflow-hidden">
                          <Zap className="h-3 w-3 shrink-0" /> <span className="truncate">Voltage</span>
                        </div>
                        <p className="mt-1 font-display text-lg font-semibold truncate">
                          {selectedData.voltage} <span className="text-[10px] font-medium text-muted-foreground">V</span>
                        </p>
                      </div>
                    )}
                    {(hasFeature(selectedDevice, selectedData, ['energy', 'consumption', 'energy_today', 'total_energy'])) && normalizeEnergyData(selectedData) !== "0.00" && (
                      <div className="rounded-2xl bg-background/50 border border-border/40 p-3 flex flex-col justify-center">
                        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap overflow-hidden">
                          <BatteryCharging className="h-3 w-3 shrink-0" /> <span className="truncate">Energy</span>
                        </div>
                        <p className="mt-1 font-display text-lg font-semibold truncate">
                          {normalizeEnergyData(selectedData)} <span className="text-[10px] font-medium text-muted-foreground">kWh</span>
                        </p>
                      </div>
                    )}
                  </div>

                  {/* WYKRYWANIE INCHING (SONOFF INCHING CONTROL SET) */}
                  {hasInching && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium inline-flex items-center gap-1.5">
                          <Timer className="h-4 w-4" /> Inching Mode
                        </span>
                        <Switch 
                          checked={isInchingEnabled} 
                          onCheckedChange={(v) => {
                             const currentState = selectedData.inching_control_set || {};
                             sendCommandOptimistic(selectedDevice.friendly_name, { 
                               inching_control_set: {
                                 inching_control: v ? "ENABLE" : "DISABLE",
                                 inching_time: currentState.inching_time || 1,
                                 inching_mode: currentState.inching_mode || "OFF"
                               }
                             });
                          }}
                        />
                      </div>

                      {isInchingEnabled && (
                        <div className="rounded-2xl bg-background/50 border border-border/40 p-5 space-y-5">
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-sm text-muted-foreground">Delay time (seconds)</span>
                              <span className="text-sm font-bold">
                                {inchingTimeVal} s
                              </span>
                            </div>
                            <Slider 
                              value={[inchingTimeVal]} 
                              min={0.5} 
                              max={3600} 
                              step={0.5}
                              onValueChange={(v) => {
                                const currentState = selectedData.inching_control_set || {};
                                sendCommandOptimistic(selectedDevice.friendly_name, { 
                                  inching_control_set: {
                                    inching_control: "ENABLE",
                                    inching_time: v[0],
                                    inching_mode: currentState.inching_mode || "OFF"
                                  }
                                });
                              }}
                            />
                          </div>
                          
                          <div className="flex items-center justify-between pt-3 border-t border-border/40">
                            <span className="text-sm text-muted-foreground font-medium">Inching mode</span>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold uppercase tracking-wider">{inchingModeVal}</span>
                              <Switch 
                                checked={inchingModeVal === "ON"} 
                                onCheckedChange={(v) => {
                                  const currentState = selectedData.inching_control_set || {};
                                  sendCommandOptimistic(selectedDevice.friendly_name, { 
                                    inching_control_set: {
                                      inching_control: "ENABLE",
                                      inching_time: currentState.inching_time || 1,
                                      inching_mode: v ? "ON" : "OFF"
                                    }
                                  });
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {hasFeature(selectedDevice, selectedData, 'countdown') && !hasInching && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium inline-flex items-center gap-1.5">
                          <Timer className="h-4 w-4" /> Auto-off timer
                        </span>
                      </div>

                      <div className="grid grid-cols-5 gap-2 mb-3">
                        {[0, 15, 30, 60, 120].map((m) => {
                          const active = selectedCountdownMins === m;
                          return (
                            <button
                              key={m}
                              onClick={() => sendCommandOptimistic(selectedDevice.friendly_name, { countdown: m * 60 })}
                              className={cn(
                                "rounded-full py-2 text-xs font-semibold transition border",
                                active ? "bg-primary text-primary-foreground border-transparent shadow-sm" : "bg-background/60 border-border/40 text-foreground/80 hover:bg-background hover:text-foreground",
                              )}
                            >
                              {m === 0 ? "Off" : m < 60 ? `${m}m` : `${m / 60}h`}
                            </button>
                          );
                        })}
                      </div>

                      <div className="rounded-2xl bg-background/50 border border-border/40 px-4 py-4 flex items-center justify-between gap-4">
                        <button
                          onClick={() => sendCommandOptimistic(selectedDevice.friendly_name, { countdown: Math.max(0, (selectedCountdownMins - 5) * 60) }) }
                          disabled={selectedCountdownMins <= 0}
                          className="h-10 w-10 shrink-0 rounded-full bg-background/80 border border-border/50 flex items-center justify-center text-foreground hover:bg-primary hover:text-primary-foreground hover:border-transparent transition disabled:opacity-30"
                        >
                          <Minus className="h-4 w-4" />
                        </button>

                        <div className="text-center leading-none flex-1 min-w-0">
                          <p className="font-display text-3xl font-semibold tabular-nums truncate">
                            {(() => {
                              if (selectedCountdownSec === 0) return "Off";
                              const h = Math.floor(selectedCountdownSec / 3600);
                              const m = Math.floor((selectedCountdownSec % 3600) / 60);
                              const s = selectedCountdownSec % 60;
                              if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
                              return `${m}:${s.toString().padStart(2, "0")}`;
                            })()}
                          </p>
                          <p className="mt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground truncate">
                            {selectedCountdownSec === 0 ? "Timer disabled" : "Live countdown"}
                          </p>
                        </div>

                        <button
                          onClick={() => sendCommandOptimistic(selectedDevice.friendly_name, { countdown: Math.min(180, (selectedCountdownMins + 5)) * 60 })}
                          disabled={selectedCountdownMins >= 180}
                          className="h-10 w-10 shrink-0 rounded-full bg-background/80 border border-border/50 flex items-center justify-center text-foreground hover:bg-primary hover:text-primary-foreground hover:border-transparent transition disabled:opacity-30"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {hasFeature(selectedDevice, selectedData, 'child_lock') && (
                    <div className="flex items-center justify-between rounded-2xl bg-background/50 border border-border/40 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center transition-colors shrink-0", selectedData.child_lock === "LOCK" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                          {selectedData.child_lock === "LOCK" ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium">Child lock</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {selectedData.child_lock === "LOCK" ? "Physical button is disabled" : "Anyone can toggle"}
                          </p>
                        </div>
                      </div>
                      <Switch checked={selectedData.child_lock === "LOCK"} onCheckedChange={(v) => sendCommand(selectedDevice.friendly_name, { child_lock: v ? "LOCK" : "UNLOCK" })} />
                    </div>
                  )}
                </div>
              ) : selectedCategory === 'light' ? (
                <div className="space-y-6">
                  <div
                    className="rounded-2xl p-8 flex items-center justify-center transition-colors duration-500"
                    style={{ background: isOn ? `radial-gradient(circle at 50% 50%, ${currentHexColor}55, ${currentHexColor}10 70%)` : "hsl(var(--muted) / 0.4)" }}
                  >
                    <Lightbulb className="h-20 w-20 transition-colors duration-500" strokeWidth={1.2} style={{ color: isOn ? currentHexColor : "hsl(var(--muted-foreground))" }} />
                  </div>

                  {hasFeature(selectedDevice, selectedData, 'color') && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium inline-flex items-center gap-1.5"><Palette className="h-4 w-4" /> Color</span>
                        <span className="font-display text-lg font-semibold uppercase">{currentHexColor}</span>
                      </div>
                      <ColorWheel
                        hue={wheelHue}
                        saturation={wheelSat}
                        onChange={(h, s) => {
                          setDeviceEffects(prev => ({ ...prev, [selectedDevice.friendly_name]: "none" }));
                          setWheelCache(prev => ({ ...prev, [selectedDevice.friendly_name]: { h, s } }));
                          sendCommandOptimistic(selectedDevice.friendly_name, { color: { h, s }, color_mode: "hs" });
                        }}
                      />
                    </div>
                  )}

                  {hasFeature(selectedDevice, selectedData, 'color_temp') && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium inline-flex items-center gap-1.5"><Thermometer className="h-4 w-4" /> Temperature</span>
                        <span className="font-display text-lg font-semibold">{currentKelvin}K</span>
                      </div>
                      <Slider
                        value={[currentKelvin]}
                        min={2000} max={6000} step={100}
                        className="[&_[role=slider]]:border-foreground/30"
                        onValueChange={(v) => {
                          setDeviceEffects(prev => ({ ...prev, [selectedDevice.friendly_name]: "none" }));
                          const mireds = Math.round(1000000 / v[0]);
                          sendCommandOptimistic(selectedDevice.friendly_name, { color_temp: mireds, color_mode: "color_temp" });
                        }}
                      />
                      <div className="mt-2 h-2 rounded-full" style={{ background: "linear-gradient(to right, #FF8B3D 0%, #FFB870 25%, #FFE4B5 50%, #FFFFFF 75%, #CFE2FF 100%)" }} />
                      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                        <span>Warm</span><span>Neutral</span><span>Cold</span>
                      </div>
                    </div>
                  )}

                  {hasFeature(selectedDevice, selectedData, 'brightness') && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium inline-flex items-center gap-1.5"><Sun className="h-4 w-4" /> Brightness</span>
                        <span className="font-display text-lg font-semibold">{currentBrightnessPct}%</span>
                      </div>
                      <Slider
                        value={[selectedData.brightness || 0]}
                        max={254} step={1}
                        onValueChange={(v) => sendCommandOptimistic(selectedDevice.friendly_name, { brightness: v[0] })}
                      />
                    </div>
                  )}

                  {/* Effect jest często powiązany z zarówkami, jeśli payload obsługuje effect - tu założymy stałość dla świateł */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium inline-flex items-center gap-1.5"><Sparkles className="h-4 w-4" /> Effect</span>
                    </div>
                    <Select 
                      value={currentEffect} 
                      onValueChange={(v) => {
                        const friendlyName = selectedDevice.friendly_name;
                        if (v !== "none") {
                          if (currentEffect === "none") {
                            const currentDeviceData = localLiveData[friendlyName] || {};
                            setPreEffectState(prev => ({
                              ...prev,
                              [friendlyName]: { color: currentDeviceData.color, color_temp: currentDeviceData.color_temp, color_mode: currentDeviceData.color_mode, brightness: currentDeviceData.brightness }
                            }));
                          }
                          setDeviceEffects(prev => ({ ...prev, [friendlyName]: v }));
                          sendCommand(friendlyName, { effect: v });
                        } else {
                          setDeviceEffects(prev => ({ ...prev, [friendlyName]: "none" }));
                          const savedState = preEffectState[friendlyName];
                          const payload: any = { effect: "finish_effect" };
                          if (savedState) {
                            if (savedState.color_mode === 'color_temp' && savedState.color_temp) { payload.color_temp = savedState.color_temp; payload.color_mode = 'color_temp'; } 
                            else if (savedState.color) { payload.color = savedState.color; payload.color_mode = savedState.color_mode || 'hs'; }
                            if (savedState.brightness) { payload.brightness = savedState.brightness; }
                          }
                          sendCommandOptimistic(friendlyName, payload);
                        }
                      }}
                    >
                      <SelectTrigger className="w-full bg-background/50 rounded-xl border-border/50 focus:ring-0 focus:outline-none">
                        <SelectValue placeholder="Select an effect..." />
                      </SelectTrigger>
                      <SelectContent className="glass rounded-xl border-border/50 p-1 shadow-xl">
                        {Object.entries(effectNames).map(([value, label]) => (
                          <SelectItem key={value} value={value} className="rounded-md focus:bg-primary/10 py-2.5">{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="pt-6 border-t border-border/50 flex flex-col gap-3 mt-auto">
              <div className="w-full">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 ml-1">Room Assignment</p>
                <Select value={selectedDevice.room_id ? selectedDevice.room_id.toString() : "unassigned"} onValueChange={(val) => handleAssignRoom(selectedDevice.friendly_name, val === "unassigned" ? null : parseInt(val))}>
                  <SelectTrigger className="w-full bg-background/50 rounded-xl border-border/50 focus:ring-0 focus:outline-none">
                    <SelectValue placeholder="Select a room" />
                  </SelectTrigger>
                  <SelectContent className="glass rounded-xl border-border/50 p-1 shadow-xl">
                    <SelectItem value="unassigned" className="rounded-md focus:bg-primary/10 py-2.5">No Room (All)</SelectItem>
                    {rooms.map((r: any) => (<SelectItem key={r.id} value={r.id.toString()} className="rounded-md focus:bg-primary/10 py-2.5">{r.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => { setDeviceToRename(selectedDevice.friendly_name); setNewName(selectedDevice.friendly_name); }} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-background/60 hover:bg-background py-2.5 text-sm font-medium transition active:scale-95">
                  <Pencil className="h-4 w-4" /> Rename
                </button>
                <button onClick={() => setDeviceToDelete(selectedDevice.friendly_name)} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 py-2.5 text-sm font-medium transition active:scale-95">
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              </div>
            </div>
            
          </GlassCard>
        ) : (
          <GlassCard className="p-6 text-sm text-muted-foreground flex items-center justify-center">
            <p>Select a device to see its controls and details.</p>
          </GlassCard>
        )}
      </div>

      <AlertDialog open={!!deviceToDelete} onOpenChange={() => setDeviceToDelete(null)}>
        <AlertDialogContent className="glass border-white/20 rounded-[28px] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-semibold">Remove device?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">Are you sure you want to remove <span className="text-foreground font-medium">{deviceToDelete}</span> from the database? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-4">
            <AlertDialogCancel className="rounded-xl border-none bg-muted hover:bg-muted/80 transition-colors">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deviceToDelete) handleDelete(deviceToDelete); setDeviceToDelete(null); }} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!deviceToRename} onOpenChange={(open) => { if (!open) setDeviceToRename(null) }}>
        <DialogContent className="glass border-white/20 rounded-[28px] max-w-sm">
          <DialogHeader><DialogTitle className="font-display">Rename Device</DialogTitle></DialogHeader>
          <div className="py-4">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Enter new device name" className="bg-background/50 border-white/10 rounded-xl" autoFocus />
          </div>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeviceToRename(null)} className="rounded-xl border-none bg-muted hover:bg-muted/80 transition-colors">Cancel</Button>
            <Button onClick={() => { if (deviceToRename && newName) { handleRename(deviceToRename, newName); setDeviceToRename(null); } }} className="rounded-xl transition-colors">Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddRoomOpen} onOpenChange={setIsAddRoomOpen}>
        <DialogContent className="glass border-white/20 rounded-[28px] max-w-sm">
          <DialogHeader><DialogTitle className="font-display">Add New Room</DialogTitle></DialogHeader>
          <div className="py-4">
            <Input value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} placeholder="e.g. Living Room" className="bg-background/50 border-white/10 rounded-xl" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleAddRoom(); }} />
          </div>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsAddRoomOpen(false)} className="rounded-xl border-none bg-muted hover:bg-muted/80 transition-colors">Cancel</Button>
            <Button onClick={handleAddRoom} className="rounded-xl transition-colors">Create Room</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!roomToDelete} onOpenChange={() => setRoomToDelete(null)}>
        <AlertDialogContent className="glass border-white/20 rounded-[28px] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-semibold">Delete Room?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">Are you sure you want to delete <span className="text-foreground font-medium">{roomToDelete?.name}</span>? Devices in this room will not be deleted, but will become unassigned.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-4">
            <AlertDialogCancel className="rounded-xl border-none bg-muted hover:bg-muted/80 transition-colors">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (roomToDelete) handleDeleteRoom(roomToDelete.id); setRoomToDelete(null); }} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

export default Devices;