import { useState, useEffect, useRef } from "react";
import {
  Cloud,
  Sun,
  Thermometer,
  Zap,
  Camera,
  Lightbulb,
  Speaker,
  Snowflake,
  Sparkles,
  Moon,
  PartyPopper,
  Wind,
  Droplets,
  ShieldAlert,
  Lock,
  Plug,
  Sunrise,
  Sunset,
  CloudRain,
  CloudLightning,
  CloudSnow
} from "lucide-react";
import { GlassCard } from "@/components/livora/GlassCard";
import { DeviceTile } from "@/components/livora/DeviceTile";
import { RoomFilter } from "@/components/livora/RoomFilter";
import { ScenePill } from "@/components/livora/ScenePill";
import { MetricBadge } from "@/components/livora/MetricBadge";

import { useDevices } from "@/hooks/use-devices";
import { useWebSockets } from "@/hooks/use-websockets";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { hexToHsl, hslToHex, kelvinToHex } from "@/lib/color";

const API_URL = import.meta.env.VITE_API_URL;

const lightStatusLabel = (isOn: boolean, brightness: number, colorMode: string, kelvin?: number, hexColor?: string) => {
  if (!isOn) return "Off";
  let mode = "Custom";
  if (colorMode === "color_temp" || (kelvin && colorMode !== "hs" && colorMode !== "xy")) {
    if (kelvin != null) mode = kelvin >= 4500 ? "Cold" : kelvin >= 3000 ? "Neutral" : "Warm";
  } else if (hexColor) {
    const { s, l } = hexToHsl(hexColor);
    if (s < 12 || l > 92) mode = "White";
  }
  return `${mode} · ${brightness}%`;
};

// Funkcja mapująca kody pogodowe WMO na czytelny tekst i ikonę
const getWeatherInfo = (code: number) => {
  if (code === 0) return { label: "Clear sky", Icon: Sun };
  if (code >= 1 && code <= 3) return { label: "Partly cloudy", Icon: Cloud };
  if (code === 45 || code === 48) return { label: "Foggy", Icon: Cloud };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { label: "Rainy", Icon: CloudRain };
  if (code >= 71 && code <= 77) return { label: "Snowy", Icon: CloudSnow };
  if (code >= 95) return { label: "Stormy", Icon: CloudLightning };
  return { label: "Unknown", Icon: Cloud };
};

const Dashboard = () => {
  const [activeScene, setActiveScene] = useState("Natural");
  const [activeRoomName, setActiveRoomName] = useState("All");

  const { data: devices = [], isLoading: isLoadingDevices } = useDevices();
  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/rooms`);
      return res.data;
    }
  });

  // --- POBIERANIE POGODY Z OPEN-METEO ---
  // Ustawione na twardo współrzędne (Szczecin), docelowo do zastąpienia danymi z profilu domu w DB
  const { data: weatherData } = useQuery({
    queryKey: ['weather'],
    queryFn: async () => {
      const res = await axios.get('https://api.open-meteo.com/v1/forecast?latitude=53.4289&longitude=14.553&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code&daily=sunrise,sunset&timezone=auto');
      return res.data;
    },
    refetchInterval: 15 * 60 * 1000 // odświeżaj co 15 minut
  });

  const { socket } = useWebSockets();
  const queryClient = useQueryClient();
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  
  const [localLiveData, setLocalLiveData] = useState<Record<string, any>>({});
  const [wheelCache] = useState<Record<string, {h: number, s: number}>>({});

  const roomNames = ["All", ...rooms.map((r: any) => r.name)];
  if (devices.some((d: any) => !d.room_id)) {
    roomNames.push("Unassigned");
  }

  // --- WEBSOCKETS I AKTUALIZACJE NA ŻYWO ---
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
          }
        }
        
        return {
          ...prev,
          [data.friendlyName]: { ...current, ...incoming }
        };
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
            next[d.friendly_name] = d.last_payload;
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

  const handleToggle = (friendlyName: string) => {
    const key = `${friendlyName}_cmd`;
    if (debounceRefs.current[key]) clearTimeout(debounceRefs.current[key]);

    setLocalLiveData(prev => {
      const current = prev[friendlyName] || {};
      const newState = current.state === "ON" ? "OFF" : "ON";
      return { ...prev, [friendlyName]: { ...current, state: newState } };
    });

    debounceRefs.current[key] = setTimeout(() => {
      axios.post(`${API_URL}/devices/${friendlyName}/set`, { state: 'TOGGLE' })
        .catch(() => toast.error(`Błąd sterowania: ${friendlyName}`));
    }, 250);
  };

  const formatRemaining = (sec: number) => {
    if (sec <= 0) return "Disabled";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
    return `${m}:${String(s).padStart(2, "0")}`; 
  };

  const filteredDevices = activeRoomName === "All" 
    ? devices 
    : devices.filter((d: any) => (d.room_name || "Unassigned") === activeRoomName);

  // --- LOGIKA DO WYŚWIETLANIA WIDGETÓW BOHATERA ---
  
  // 1. Zmienne pogody zewnętrznej
  let weatherTemp = "--";
  let weatherFeels = "--";
  let weatherHum = "--";
  let WeatherIcon = Cloud;
  let weatherLabel = "Loading data...";
  let locationName = "Szczecin"; // Twardo zakodowane dla lokalizacji pogody

  // 2. Obliczanie słońca
  let sunLabel = "Sunset";
  let sunTimeStr = "--:--";
  let SunEventIcon = Sunset;

  if (weatherData && weatherData.current) {
    weatherTemp = weatherData.current.temperature_2m.toFixed(1);
    weatherFeels = weatherData.current.apparent_temperature.toFixed(1);
    weatherHum = weatherData.current.relative_humidity_2m;
    
    const info = getWeatherInfo(weatherData.current.weather_code);
    WeatherIcon = info.Icon;
    weatherLabel = info.label;

    const now = new Date();
    const sunrise = new Date(weatherData.daily.sunrise[0]);
    const sunset = new Date(weatherData.daily.sunset[0]);
    const tomorrowSunrise = new Date(weatherData.daily.sunrise[1]);

    if (now < sunrise) {
      sunLabel = "Sunrise";
      sunTimeStr = sunrise.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      SunEventIcon = Sunrise;
    } else if (now < sunset) {
      sunLabel = "Sunset";
      sunTimeStr = sunset.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      SunEventIcon = Sunset;
    } else {
      sunLabel = "Sunrise";
      sunTimeStr = tomorrowSunrise.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      SunEventIcon = Sunrise;
    }
  }

  // 3. Szukanie czujnika temperatury wewnętrznej
  const climateDevice = devices.find((d: any) => {
    const live = localLiveData[d.friendly_name] || d.last_payload || {};
    return live.temperature !== undefined;
  });

  let indoorTemp = "--";
  let indoorHum = "--";
  let indoorRoom = "No sensor found";

  if (climateDevice) {
    const live = localLiveData[climateDevice.friendly_name] || climateDevice.last_payload || {};
    indoorTemp = live.temperature !== undefined ? live.temperature.toFixed(1) : "--";
    indoorHum = live.humidity !== undefined ? `${live.humidity}% humidity` : 'No humidity data';
    indoorRoom = climateDevice.room_name || "Unassigned";
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <h1 className="sr-only">Livora dashboard</h1>

      {/* Hero + energy strip */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <GlassCard variant="strong" className="lg:col-span-2 p-7 relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <WeatherIcon className="h-4 w-4" />
              {weatherLabel} · {locationName}
            </div>
            <div className="mt-4 flex items-end gap-4">
              <p className="font-display text-7xl font-semibold leading-none">{weatherTemp}°</p>
              <div className="pb-2 text-sm text-muted-foreground">
                <p>Feels like {weatherFeels}°</p>
                <p>Humidity {weatherHum}%</p>
              </div>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4">
            {/* Wewnętrzny Termometr */}
            <div className="rounded-2xl bg-background/50 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground truncate">
                <Thermometer className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{indoorRoom}</span>
              </div>
              <p className="mt-2 font-display text-2xl font-semibold">{indoorTemp}°C</p>
              <p className="text-xs text-muted-foreground truncate">{indoorHum}</p>
            </div>
            
            {/* Słońce */}
            <div className="rounded-2xl bg-background/50 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <SunEventIcon className="h-3.5 w-3.5" /> {sunLabel}
              </div>
              <p className="mt-2 font-display text-2xl font-semibold">{sunTimeStr}</p>
              <p className="text-xs text-muted-foreground opacity-0 select-none">Placeholder</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-6 flex flex-col">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Energy now</p>
            <MetricBadge value={-12} inverted />
          </div>
          <p className="mt-2 font-display text-5xl font-semibold leading-none">
            65.32<span className="ml-1 text-base font-medium text-muted-foreground">kW/h</span>
          </p>

          <svg viewBox="0 0 200 60" className="mt-6 w-full h-16">
            <defs>
              <linearGradient id="spark" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--brand-sky))" stopOpacity="0.5" />
                <stop offset="100%" stopColor="hsl(var(--brand-sky))" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0,40 C20,30 30,45 50,35 C70,25 90,40 110,28 C130,16 150,32 170,22 C185,15 195,20 200,18 L200,60 L0,60 Z"
              fill="url(#spark)"
            />
            <path
              d="M0,40 C20,30 30,45 50,35 C70,25 90,40 110,28 C130,16 150,32 170,22 C185,15 195,20 200,18"
              fill="none"
              stroke="hsl(var(--brand-graphite))"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>

          <div className="mt-auto pt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Zap className="h-4 w-4" />
            Today’s avg lower than yesterday
          </div>
        </GlassCard>
      </div>

      {/* Scenes */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-xl font-semibold">Quick scenes</h2>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Natural", icon: Sun },
            { label: "Relax", icon: Sparkles },
            { label: "Party", icon: PartyPopper },
            { label: "Goodnight", icon: Moon },
          ].map((s) => (
            <ScenePill
              key={s.label}
              icon={s.icon}
              label={s.label}
              active={activeScene === s.label}
              onClick={() => setActiveScene(s.label)}
            />
          ))}
        </div>
      </div>

      {/* Rooms + dynamic devices */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-display text-xl font-semibold">Devices</h2>
          <RoomFilter rooms={roomNames} active={activeRoomName} onChange={setActiveRoomName} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {isLoadingDevices ? (
            <p className="col-span-4 text-center py-10 text-muted-foreground">Loading devices...</p>
          ) : filteredDevices.length === 0 ? (
             <p className="col-span-4 text-center py-10 text-muted-foreground">No devices found in {activeRoomName}.</p>
          ) : (
            filteredDevices.map((d: any) => {
              const dData = localLiveData[d.friendly_name] || {};
              const isOffline = dData.state === 'OFFLINE' || dData.state === 'offline' || dData.availability === 'offline';
              
              const isContactSensor = dData.contact !== undefined || dData.tamper !== undefined;
              const isWaterLeak = dData.water_leak !== undefined;
              const isClimateSensor = dData.temperature !== undefined || dData.humidity !== undefined;
              const isPlug = dData.power !== undefined || dData.current !== undefined || dData.energy !== undefined || dData.consumption !== undefined;
              
              const closed = dData.contact ?? true;
              const dIsOn = (isContactSensor || isWaterLeak || isClimateSensor) ? !isOffline : (dData.state === "ON" && !isOffline);

              let icon = Lightbulb;
              let statusLabel = "Off";
              let statusColor = undefined;
              let iconColor = undefined;
              let livePulse = false;
              let showSwitch = true;

              if (isWaterLeak) {
                const leaked = dData.water_leak === true || dData.water_leak === "true";
                icon = Droplets;
                statusLabel = leaked ? "LEAK!" : "Dry";
                statusColor = leaked ? "#E5484D" : "#7FD4A1";
                livePulse = leaked;
                showSwitch = false;

              } else if (isContactSensor) {
                const tampered = dData.tamper === true || dData.tamper === "true";
                icon = tampered ? ShieldAlert : Lock;
                statusLabel = tampered ? "TAMPER!" : (closed ? "Closed" : "Open");
                statusColor = tampered ? "#E5484D" : (closed ? "#7FD4A1" : "#E5484D");
                livePulse = tampered;
                showSwitch = false;
                
              } else if (isClimateSensor) {
                const temp = dData.temperature ?? 0;
                const hum = dData.humidity ?? 0;
                icon = Thermometer;
                statusLabel = `${temp}°C · ${hum}%`;
                statusColor = temp < 20 ? "#3B82F6" : "#F97316"; 
                livePulse = false;
                showSwitch = false;

              } else if (isPlug) {
                icon = Plug;
                livePulse = dIsOn && (dData.power > 0);
                if (!dIsOn) {
                  statusLabel = "Off";
                  livePulse = false;
                } else {
                  const remainingSec = dData.countdown || 0;
                  let parts = [`${Math.round(dData.power ?? 0)}W`];
                  if (remainingSec > 0) parts.push(`Auto-off: ${formatRemaining(remainingSec)}`);
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
                  room={d.room_name || "Unassigned"}
                  livePulse={livePulse}
                  statusLabel={statusLabel}
                  statusColor={statusColor}
                  iconColor={iconColor}
                  enabled={dIsOn}
                  offline={isOffline}
                  showSwitch={showSwitch}
                  onToggle={() => handleToggle(d.friendly_name)}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;