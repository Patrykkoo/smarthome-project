import { useState, useEffect, useRef } from "react";
import { 
  Lightbulb, LayoutGrid, Pencil, Trash2, Thermometer, Sun, Palette, Sparkles, Signal,
  Plug, Lock, Unlock, Timer, Zap, Activity, BatteryCharging, Minus, Plus, RotateCcw, WifiOff
} from "lucide-react";
import { GlassCard } from "@/components/livora/GlassCard";
import { DeviceTile } from "@/components/livora/DeviceTile";
import { ColorWheel } from "@/components/livora/ColorWheel";
import { cn } from "@/lib/utils";
import { useDevices } from "@/hooks/use-devices";
import { useWebSockets } from "@/hooks/use-websockets";
import axios from "axios";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { hexToHsl, hslToHex, kelvinToHex } from "@/lib/color";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const API_URL = import.meta.env.VITE_API_URL;

const effectNames: Record<string, string> = {
  none: "None",
  blink: "Blink",
  breathe: "Breathe",
  channel_change: "Signal flash",
  colorloop: "Color loop"
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

const Devices = () => {
  const { data: devices = [], isLoading } = useDevices();
  const { socket } = useWebSockets();
  const queryClient = useQueryClient();
  
  const [activeRoom, setActiveRoom] = useState("All");
  const [localLiveData, setLocalLiveData] = useState<Record<string, any>>({});
  
  const [deviceToRename, setDeviceToRename] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [deviceToDelete, setDeviceToDelete] = useState<string | null>(null);
  
  const [selectedDevice, setSelectedDevice] = useState<any | null>(null);
  
  const [deviceEffects, setDeviceEffects] = useState<Record<string, string>>({});
  const [preEffectState, setPreEffectState] = useState<Record<string, any>>({});

  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [wheelCache, setWheelCache] = useState<Record<string, {h: number, s: number}>>({});

  useEffect(() => {
    if (!socket) return;
    socket.on('device_state_update', (data: any) => {
      setLocalLiveData(prev => ({
        ...prev,
        [data.friendlyName]: { ...(prev[data.friendlyName] || {}), ...data.payload }
      }));
    });
    socket.on('device_list_updated', () => queryClient.invalidateQueries({ queryKey: ['devices'] }));
    return () => { 
      socket.off('device_state_update'); 
      socket.off('device_list_updated');
    };
  }, [socket, queryClient]);

  useEffect(() => {
    if (devices.length > 0) {
      const initialData: Record<string, any> = {};
      devices.forEach(d => { if (d.last_payload) initialData[d.friendly_name] = d.last_payload; });
      setLocalLiveData(prev => ({ ...initialData, ...prev }));
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
      return { ...prev, [friendlyName]: { ...current, ...payload } };
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

    setLocalLiveData(prev => {
      const current = prev[friendlyName] || {};
      const newState = current.state === "ON" ? "OFF" : "ON";
      return { ...prev, [friendlyName]: { ...current, state: newState } };
    });

    sendCommand(friendlyName, { state: 'TOGGLE' });
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
    if (oldName === updatedName || !updatedName.trim()) return;
    try {
      await axios.put(`${API_URL}/devices/${oldName}/rename`, { new_name: updatedName.trim() });
      toast.success("Zmieniono nazwę urządzenia");
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    } catch (error) {
      toast.error("Nie udało się zmienić nazwy urządzenia");
    }
  };

  const rooms = [
    { name: "All", count: devices.length },
    { name: "Living room", count: 0 },
    { name: "Kitchen", count: 0 },
    { name: "Bedroom", count: 0 },
  ];

  const filteredDevices = activeRoom === "All" ? devices : [];

  const selectedData = selectedDevice ? (localLiveData[selectedDevice.friendly_name] || {}) : {};
  // NOWOŚĆ: Sprawdzenie stanu z payloadu i z klucza 'availability', jeśli Zigbee2MQTT go przysyła.
  const isSelectedOffline = selectedData.state === 'OFFLINE' || selectedData.state === 'offline' || selectedData.availability === 'offline';
  const isOn = selectedData.state === "ON" && !isSelectedOffline;
  
  const isSelectedPlug = selectedData.power !== undefined || selectedData.current !== undefined || selectedData.energy !== undefined || selectedData.consumption !== undefined;

  let currentHexColor = "#FFFFFF";
  let currentKelvin = 4000;
  
  if (!isSelectedPlug) {
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

  const formatRemaining = (sec: number) => {
    if (sec <= 0) return "Disabled";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
    return `${m}m ${String(s).padStart(2, "0")}s`;
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="font-display text-3xl font-semibold">Devices & Rooms</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage every connected device room by room.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_400px] gap-6">
        <GlassCard className="p-3 h-fit">
          <ul className="space-y-1">
            {rooms.map((r) => (
              <li key={r.name}>
                <button
                  onClick={() => { setActiveRoom(r.name); setSelectedDevice(null); }}
                  className={cn(
                    "w-full flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition-colors",
                    r.name === activeRoom
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                      : "text-foreground/70 hover:text-foreground hover:bg-muted/60",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {r.name === "All" && <LayoutGrid className="h-4 w-4" />}
                    <span>{r.name}</span>
                  </div>
                  <span className="text-xs opacity-70">{r.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </GlassCard>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 content-start">
          {isLoading ? (
            <p className="col-span-2 text-center py-10 text-muted-foreground">Loading devices...</p>
          ) : filteredDevices.length === 0 ? (
            <p className="col-span-2 text-center py-10 text-muted-foreground">No devices found.</p>
          ) : (
            filteredDevices.map((d) => {
              const dData = localLiveData[d.friendly_name] || {};
              const isOffline = dData.state === 'OFFLINE' || dData.state === 'offline' || dData.availability === 'offline';
              const dIsOn = dData.state === "ON" && !isOffline;
              
              const isPlug = dData.power !== undefined || dData.current !== undefined || dData.energy !== undefined || dData.consumption !== undefined;

              let icon = Lightbulb;
              let statusLabel = "Off";
              let statusColor = undefined;
              let iconColor = undefined;
              let livePulse = false;

              if (isPlug) {
                icon = Plug;
                iconColor = undefined; 
                livePulse = dIsOn && (dData.power > 0);
                
                if (!dIsOn) {
                  statusLabel = "Off";
                  livePulse = false;
                } else {
                  const remainingSec = dData.countdown || 0;
                  let parts = [`${Math.round(dData.power ?? 0)}W`];
                  if (remainingSec > 0) {
                    parts.push(`Auto-off: ${formatRemaining(remainingSec)}`);
                  }
                  statusLabel = parts.join(" · ");
                }
              } else {
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
                  room={activeRoom}
                  livePulse={livePulse}
                  statusLabel={statusLabel}
                  statusColor={statusColor}
                  iconColor={iconColor}
                  enabled={dIsOn}
                  offline={isOffline}
                  selected={selectedDevice?.id === d.id}
                  onClick={() => setSelectedDevice(d)} 
                  onToggle={() => handleToggle(d.friendly_name)}
                />
              );
            })
          )}
        </div>

        {selectedDevice ? (
          <GlassCard variant="strong" className="p-6 h-fit space-y-6 overflow-hidden flex flex-col">
            
            <div className="flex items-start justify-between gap-3 relative z-20">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{activeRoom}</p>
                  
                  {/* ZMIANA: Etykieta połączenia z czerwoną plakietką Offline */}
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
              <Switch
                checked={isOn}
                disabled={isSelectedOffline}
                onCheckedChange={() => handleToggle(selectedDevice.friendly_name)}
              />
            </div>

            {/* KONTENER Z CONTROLSAMI - Z OVERLAYEM OFFLINE */}
            <div className="relative space-y-6 pb-2 border-b border-border/50">
              {isSelectedOffline && (
                <div className="absolute inset-[-16px] z-50 bg-background/50 backdrop-blur-[2px] flex items-center justify-center rounded-xl">
                  <div className="bg-background/90 border border-white/10 px-5 py-3 rounded-2xl flex items-center gap-3 text-sm font-medium shadow-2xl text-foreground">
                    <WifiOff className="h-5 w-5 text-destructive" />
                    Brak odpowiedzi z urządzenia
                  </div>
                </div>
              )}

              {isSelectedPlug ? (
                // PANEL SMART PLUG
                <>
                  <div
                    className={cn(
                      "rounded-2xl p-6 flex items-center justify-between transition-colors",
                      isOn ? "bg-blue-500/10" : "bg-muted/40",
                    )}
                  >
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Power draw</p>
                      <p className="mt-1 font-display text-4xl font-semibold">
                        {isOn ? Math.round(selectedData.power ?? 0) : 0}
                        <span className="ml-1 text-base font-medium text-muted-foreground">W</span>
                      </p>
                    </div>
                    <div
                      className={cn(
                        "h-14 w-14 rounded-2xl flex items-center justify-center transition-colors",
                        isOn ? "bg-blue-500 text-white" : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Plug className="h-6 w-6" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Current", value: selectedData.current ?? 0, unit: "A", icon: Activity },
                      { label: "Voltage", value: selectedData.voltage ?? 0, unit: "V", icon: Zap },
                      { label: "Energy", value: Number(selectedData.energy ?? selectedData.consumption ?? selectedData.total_energy ?? 0).toFixed(2), unit: "kWh", icon: BatteryCharging },
                    ].map((m) => (
                      <div key={m.label} className="rounded-2xl bg-background/50 border border-border/40 p-3 flex flex-col justify-center">
                        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap overflow-hidden">
                          <m.icon className="h-3 w-3 shrink-0" />
                          <span className="truncate">{m.label}</span>
                        </div>
                        <p className="mt-1 font-display text-lg font-semibold truncate">
                          {m.value}
                          {m.unit && <span className="ml-1 text-[10px] font-medium text-muted-foreground">{m.unit}</span>}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium inline-flex items-center gap-1.5">
                        <Timer className="h-4 w-4" /> Auto-off timer
                      </span>
                      {selectedCountdownMins > 0 && (
                        <button
                          onClick={() => sendCommandOptimistic(selectedDevice.friendly_name, { countdown: 0 })}
                          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition relative z-20"
                        >
                          <RotateCcw className="h-3 w-3" /> Reset
                        </button>
                      )}
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
                              active
                                ? "bg-primary text-primary-foreground border-transparent shadow-sm"
                                : "bg-background/60 border-border/40 text-foreground/80 hover:bg-background hover:text-foreground",
                            )}
                          >
                            {m === 0 ? "Off" : m < 60 ? `${m}m` : `${m / 60}h`}
                          </button>
                        );
                      })}
                    </div>

                    <div className="rounded-2xl bg-background/50 border border-border/40 px-4 py-4 flex items-center justify-between gap-4">
                      <button
                        onClick={() => sendCommandOptimistic(selectedDevice.friendly_name, { countdown: Math.max(0, (selectedCountdownMins - 5) * 60) })}
                        disabled={selectedCountdownMins <= 0}
                        className="h-10 w-10 shrink-0 rounded-full bg-background/80 border border-border/50 flex items-center justify-center text-foreground hover:bg-primary hover:text-primary-foreground hover:border-transparent transition disabled:opacity-30 disabled:hover:bg-background/80 disabled:hover:text-foreground disabled:hover:border-border/50"
                      >
                        <Minus className="h-4 w-4" />
                      </button>

                      <div className="text-center leading-none flex-1 min-w-0">
                        <p className="font-display text-3xl font-semibold tabular-nums truncate">
                          {(() => {
                            if (selectedCountdownMins === 0) return "Off";
                            const h = Math.floor(selectedCountdownMins / 60);
                            const mm = selectedCountdownMins % 60;
                            if (h === 0) return `${mm}`;
                            if (mm === 0) return `${h}h`;
                            return `${h}h ${mm}`;
                          })()}
                          {selectedCountdownMins > 0 && (
                            <span className="ml-1 text-sm font-medium text-muted-foreground">
                              {selectedCountdownMins < 60 || selectedCountdownMins % 60 !== 0 ? "min" : ""}
                            </span>
                          )}
                        </p>
                        <p className="mt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground truncate">
                          {selectedCountdownMins === 0
                            ? "Timer disabled"
                            : (![0, 15, 30, 60, 120].includes(selectedCountdownMins))
                            ? "Custom · ±5 min"
                            : "Tap ± to fine-tune"}
                        </p>
                      </div>

                      <button
                        onClick={() => sendCommandOptimistic(selectedDevice.friendly_name, { countdown: Math.min(180, (selectedCountdownMins + 5)) * 60 })}
                        disabled={selectedCountdownMins >= 180}
                        className="h-10 w-10 shrink-0 rounded-full bg-background/80 border border-border/50 flex items-center justify-center text-foreground hover:bg-primary hover:text-primary-foreground hover:border-transparent transition disabled:opacity-30 disabled:hover:bg-background/80 disabled:hover:text-foreground disabled:hover:border-border/50"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl bg-background/50 border border-border/40 px-4 py-3 relative z-20">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "h-9 w-9 rounded-xl flex items-center justify-center transition-colors shrink-0",
                          selectedData.child_lock === "LOCK" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {selectedData.child_lock === "LOCK" ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium">Child lock</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {selectedData.child_lock === "LOCK" ? "Physical button is disabled" : "Anyone can toggle"}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={selectedData.child_lock === "LOCK"}
                      onCheckedChange={(v) => sendCommand(selectedDevice.friendly_name, { child_lock: v ? "LOCK" : "UNLOCK" })}
                    />
                  </div>
                </>
              ) : (
                // PANEL OŚWIETLENIA
                <>
                  <div
                    className="rounded-2xl p-8 flex items-center justify-center transition-colors duration-500"
                    style={{
                      background: isOn
                        ? `radial-gradient(circle at 50% 50%, ${currentHexColor}55, ${currentHexColor}10 70%)`
                        : "hsl(var(--muted) / 0.4)",
                    }}
                  >
                    <Lightbulb
                      className="h-20 w-20 transition-colors duration-500"
                      strokeWidth={1.2}
                      style={{ color: isOn ? currentHexColor : "hsl(var(--muted-foreground))" }}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium inline-flex items-center gap-1.5">
                        <Palette className="h-4 w-4" /> Color
                      </span>
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

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium inline-flex items-center gap-1.5">
                        <Thermometer className="h-4 w-4" /> Temperature
                      </span>
                      <span className="font-display text-lg font-semibold">{currentKelvin}K</span>
                    </div>
                    <Slider
                      value={[currentKelvin]}
                      min={2000}
                      max={6000}
                      step={100}
                      className="[&_[role=slider]]:border-foreground/30 relative z-20"
                      onValueChange={(v) => {
                        setDeviceEffects(prev => ({ ...prev, [selectedDevice.friendly_name]: "none" }));
                        const mireds = Math.round(1000000 / v[0]);
                        sendCommandOptimistic(selectedDevice.friendly_name, { color_temp: mireds, color_mode: "color_temp" });
                      }}
                    />
                    <div
                      className="mt-2 h-2 rounded-full"
                      style={{
                        background:
                          "linear-gradient(to right, #FF8B3D 0%, #FFB870 25%, #FFE4B5 50%, #FFFFFF 75%, #CFE2FF 100%)",
                      }}
                    />
                    <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                      <span>Warm</span><span>Neutral</span><span>Cold</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium inline-flex items-center gap-1.5">
                        <Sun className="h-4 w-4" /> Brightness
                      </span>
                      <span className="font-display text-lg font-semibold">{currentBrightnessPct}%</span>
                    </div>
                    <Slider
                      value={[selectedData.brightness || 0]}
                      max={254}
                      step={1}
                      className="relative z-20"
                      onValueChange={(v) => sendCommandOptimistic(selectedDevice.friendly_name, { brightness: v[0] })}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium inline-flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4" /> Effect
                      </span>
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
                              [friendlyName]: {
                                color: currentDeviceData.color,
                                color_temp: currentDeviceData.color_temp,
                                color_mode: currentDeviceData.color_mode,
                                brightness: currentDeviceData.brightness
                              }
                            }));
                          }
                          
                          setDeviceEffects(prev => ({ ...prev, [friendlyName]: v }));
                          sendCommand(friendlyName, { effect: v });
                        } else {
                          setDeviceEffects(prev => ({ ...prev, [friendlyName]: "none" }));
                          
                          const savedState = preEffectState[friendlyName];
                          const payload: any = { effect: "finish_effect" };
                          
                          if (savedState) {
                            if (savedState.color_mode === 'color_temp' && savedState.color_temp) {
                              payload.color_temp = savedState.color_temp;
                              payload.color_mode = 'color_temp';
                            } else if (savedState.color) {
                              payload.color = savedState.color;
                              payload.color_mode = savedState.color_mode || 'hs';
                            }
                            if (savedState.brightness) {
                              payload.brightness = savedState.brightness;
                            }
                          }
                          
                          sendCommandOptimistic(friendlyName, payload);
                        }
                      }}
                    >
                      <SelectTrigger className="w-full bg-background/50 rounded-xl border-border/50 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none outline-none ring-0 relative z-20">
                        <SelectValue placeholder="Select an effect..." />
                      </SelectTrigger>
                      <SelectContent className="glass rounded-xl border-border/50 p-1 shadow-xl">
                        {Object.entries(effectNames).map(([value, label]) => (
                          <SelectItem 
                            key={value} 
                            value={value}
                            className="rounded-md focus:bg-primary/10 focus:text-foreground transition-colors cursor-pointer py-2.5"
                          >
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>

            {/* AKCJE - Pozostawione poza overlayem, aby można było usunąć wyłączone urządzenie z bazy */}
            <div className="pt-2 flex items-center gap-2 relative z-20">
              <button
                onClick={() => { setDeviceToRename(selectedDevice.friendly_name); setNewName(selectedDevice.friendly_name); }}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-background/60 hover:bg-background py-2.5 text-sm font-medium transition active:scale-95"
              >
                <Pencil className="h-4 w-4" /> Rename
              </button>
              <button
                onClick={() => setDeviceToDelete(selectedDevice.friendly_name)}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 py-2.5 text-sm font-medium transition active:scale-95"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </div>
            
          </GlassCard>
        ) : (
          <GlassCard className="p-6 h-fit text-center text-sm text-muted-foreground">
            Select a device to see its controls.
          </GlassCard>
        )}
      </div>

      <AlertDialog open={!!deviceToDelete} onOpenChange={() => setDeviceToDelete(null)}>
        <AlertDialogContent className="glass border-white/20 rounded-[28px] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-semibold">Remove device?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to remove <span className="text-foreground font-medium">{deviceToDelete}</span> from the database? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-4">
            <AlertDialogCancel className="rounded-xl border-none bg-muted hover:bg-muted/80 transition-colors">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (deviceToDelete) handleDelete(deviceToDelete);
                setDeviceToDelete(null);
              }}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!deviceToRename} onOpenChange={(open) => { if (!open) setDeviceToRename(null) }}>
        <DialogContent className="glass border-white/20 rounded-[28px] max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Rename Device</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input 
              value={newName} 
              onChange={(e) => setNewName(e.target.value)} 
              placeholder="Enter new device name"
              className="bg-background/50 border-white/10 rounded-xl"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 mt-4">
            <Button 
              variant="outline" 
              onClick={() => setDeviceToRename(null)} 
              className="rounded-xl border-none bg-muted hover:bg-muted/80 transition-colors"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (deviceToRename && newName) {
                  handleRename(deviceToRename, newName);
                  setDeviceToRename(null);
                }
              }}
              className="rounded-xl transition-colors"
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Devices;