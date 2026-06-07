import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Cloud,
  Sun,
  Thermometer,
  Zap,
  Lightbulb,
  Sparkles,
  Moon,
  PartyPopper,
  Droplets,
  ShieldAlert,
  Lock,
  Plug,
  Sunrise,
  Sunset,
  CloudRain,
  CloudLightning,
  CloudSnow,
  TrendingDown,
  TrendingUp,
  MapPinOff
} from "lucide-react";
import { GlassCard } from "@/components/smartify/GlassCard";
import { DeviceTile } from "@/components/smartify/DeviceTile";
import { RoomFilter } from "@/components/smartify/RoomFilter";

import { useDevices } from "@/hooks/use-devices";
import { useWebSockets } from "@/hooks/use-websockets";
import { useActiveScene } from "@/hooks/use-active-scene";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { hexToHsl, hslToHex, kelvinToHex } from "@/lib/color";
import { cn } from "@/lib/utils";

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

const getWeatherInfo = (code: number) => {
  if (code === 0) return { label: "Clear sky", Icon: Sun };
  if (code >= 1 && code <= 3) return { label: "Partly cloudy", Icon: Cloud };
  if (code === 45 || code === 48) return { label: "Foggy", Icon: Cloud };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { label: "Rainy", Icon: CloudRain };
  if (code >= 71 && code <= 77) return { label: "Snowy", Icon: CloudSnow };
  if (code >= 95) return { label: "Stormy", Icon: CloudLightning };
  return { label: "Unknown", Icon: Cloud };
};

const generateSparkline = (data: number[], width: number, height: number) => {
  if (!data || data.length === 0) return "";
  
  const min = 0; 
  const max = Math.max(...data, 10); 
  const range = max - min;
  const stepX = width / Math.max(data.length - 1, 1);

  return data.map((val, i) => {
    const x = i * stepX;
    const y = height - ((val - min) / range) * (height - 10) - 5; 
    
    if (i === 0) return `M ${x},${y}`;
    
    const prevX = (i - 1) * stepX;
    const prevY = height - ((data[i - 1] - min) / range) * (height - 10) - 5;
    const cpX1 = prevX + stepX / 2;
    const cpX2 = x - stepX / 2;
    
    return `C ${cpX1},${prevY} ${cpX2},${y} ${x},${y}`;
  }).join(" ");
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { activeSceneId, setActiveScene } = useActiveScene();
  const [activeRoomName, setActiveRoomName] = useState("All");
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const [settingsTrigger, setSettingsTrigger] = useState(0);

  const { data: devices = [], isLoading: isLoadingDevices } = useDevices();
  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/rooms`);
      return res.data;
    }
  });

  const { data: scenes = [] } = useQuery({
    queryKey: ['scenes'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/scenes`);
      return res.data;
    }
  });

  const { data: weatherData } = useQuery({
    queryKey: ['weather', settingsTrigger],
    queryFn: async () => {
      try {
        const lat = localStorage.getItem('smartify_location_lat');
        const lon = localStorage.getItem('smartify_location_lon');
        const locName = localStorage.getItem('smartify_location_name');

        if (!lat || !lon || !locName) {
          return null;
        }

        const res = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code&daily=sunrise,sunset&timezone=auto`);
        
        if (!res.data || !res.data.current) throw new Error("Invalid weather payload");

        return { ...res.data, locationName: locName };
      } catch (error) {
        console.error("Weather data fetch error", error);
        return null;
      }
    },
    refetchInterval: 15 * 60 * 1000 
  });

  const { data: energyStats } = useQuery({
    queryKey: ['energyStats'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/energy/stats`);
      return res.data;
    },
    refetchInterval: 60 * 1000 
  });

  const { socket } = useWebSockets();
  const queryClient = useQueryClient();
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [localLiveData, setLocalLiveData] = useState<Record<string, any>>({});
  const [wheelCache] = useState<Record<string, {h: number, s: number}>>({});

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleSettingsChange = () => setSettingsTrigger(prev => prev + 1);
    window.addEventListener('user_settings_changed', handleSettingsChange);
    return () => window.removeEventListener('user_settings_changed', handleSettingsChange);
  }, []);

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
            if (incoming.countdown > 0) {
              sessionStorage.setItem(`countdown_ends_at_${data.friendlyName}`, (Date.now() + incoming.countdown * 1000).toString());
            } else {
              sessionStorage.removeItem(`countdown_ends_at_${data.friendlyName}`);
            }
          }
        }
        return { ...prev, [data.friendlyName]: { ...current, ...incoming } };
      });

      queryClient.setQueryData(['devices'], (old: any) => {
        if (!old) return old;
        return old.map((d: any) => d.friendly_name === data.friendlyName ? { ...d, last_payload: { ...d.last_payload, ...data.payload } } : d);
      });
    });

    socket.on('device_list_updated', () => queryClient.invalidateQueries({ queryKey: ['devices'] }));
    return () => { socket.off('device_state_update'); socket.off('device_list_updated'); };
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

  const handleToggle = (friendlyName: string) => {
    const key = `${friendlyName}_cmd`;
    if (debounceRefs.current[key]) clearTimeout(debounceRefs.current[key]);

    let newState = "ON";
    setLocalLiveData(prev => {
      const current = prev[friendlyName] || {};
      newState = current.state === "ON" ? "OFF" : "ON";
      return { ...prev, [friendlyName]: { ...current, state: newState } };
    });

    queryClient.setQueryData(['devices'], (old: any) => {
      if (!old) return old;
      return old.map((d: any) => d.friendly_name === friendlyName ? { ...d, last_payload: { ...d.last_payload, state: newState } } : d);
    });

    debounceRefs.current[key] = setTimeout(() => {
      axios.post(`${API_URL}/devices/${friendlyName}/set`, { state: 'TOGGLE' })
        .catch(() => toast.error(`Control error, ${friendlyName}`));
    }, 250);
  };

  const handleSceneTrigger = async (sceneName: string) => {
    const scene = scenes.find((s: any) => s.name === sceneName);
    if (scene) {
      setActiveScene(scene.id);
      try {
        await axios.post(`${API_URL}/scenes/${scene.id}/trigger`);
      } catch (error) {
        toast.error("Failed to trigger scene");
      }
    }
  };

  const formatRemaining = (sec: number) => {
    if (sec <= 0) return "Disabled";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
    return `${m}:${String(s).padStart(2, "0")}`; 
  };

  const roomNames = ["All", ...rooms.map((r: any) => r.name)];
  if (devices.some((d: any) => !d.room_id)) roomNames.push("Unassigned");

  const sceneNames = scenes.map((s: any) => s.name);
  const activeSceneName = scenes.find((s: any) => s.id === activeSceneId)?.name || "";

  const filteredDevices = activeRoomName === "All" 
    ? devices 
    : devices.filter((d: any) => (d.room_name || "Unassigned") === activeRoomName);

  let weatherTemp = "--", weatherFeels = "--", weatherHum = "--", WeatherIcon = MapPinOff, weatherLabel = "Location not set", sunLabel = "Sun Events", sunTimeStr = "--:--", sunSubLabel = "Update in Settings", SunEventIcon = Sun, locationName = "Set location in settings";
  
  if (weatherData && weatherData.current) {
    locationName = weatherData.locationName;
    weatherTemp = weatherData.current.temperature_2m.toFixed(1);
    weatherFeels = weatherData.current.apparent_temperature.toFixed(1);
    weatherHum = weatherData.current.relative_humidity_2m;
    const info = getWeatherInfo(weatherData.current.weather_code);
    WeatherIcon = info.Icon; weatherLabel = info.label;
    
    const sunrise = new Date(weatherData.daily.sunrise[0]);
    const sunset = new Date(weatherData.daily.sunset[0]);
    const tomorrowSunrise = new Date(weatherData.daily.sunrise[1]);
    
    let targetDate;
    if (currentTime < sunrise) { 
      sunLabel = "Sunrise"; 
      sunTimeStr = sunrise.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); 
      SunEventIcon = Sunrise; 
      targetDate = sunrise; 
    }
    else if (currentTime < sunset) { 
      sunLabel = "Sunset"; 
      sunTimeStr = sunset.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); 
      SunEventIcon = Sunset; 
      targetDate = sunset; 
    }
    else { 
      sunLabel = "Sunrise"; 
      sunTimeStr = tomorrowSunrise.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); 
      SunEventIcon = Sunrise; 
      targetDate = tomorrowSunrise; 
    }

    if (targetDate) {
      const diffMins = Math.floor((targetDate.getTime() - currentTime.getTime()) / 60000);
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      const timeString = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      sunSubLabel = (currentTime >= sunrise && currentTime < sunset) ? `Daylight for next ${timeString}` : `Darkness for next ${timeString}`;
    }
  }

  const climateDevice = devices.find((d: any) => {
    const live = localLiveData[d.friendly_name] || d.last_payload || {};
    return live.temperature !== undefined;
  });

  let indoorTemp = "--", indoorHum = "No humidity data", indoorRoom = "No sensor found";
  
  if (climateDevice) {
    const live = localLiveData[climateDevice.friendly_name] || climateDevice.last_payload || {};
    indoorTemp = live.temperature !== undefined ? live.temperature.toFixed(1) : "--";
    indoorHum = live.humidity !== undefined ? `${live.humidity}% humidity` : 'No humidity data';
    indoorRoom = climateDevice.room_name || "Unassigned";
  }

  const currentTotalPower = devices.reduce((sum: number, d: any) => {
    const live = localLiveData[d.friendly_name] || d.last_payload || {};
    const isOffline = live.state === 'OFFLINE' || live.state === 'offline' || live.availability === 'offline';
    if (!isOffline && live.state === "ON" && live.power) {
      return sum + live.power;
    }
    return sum;
  }, 0);

  const todayKwh = energyStats?.todayKwh ? parseFloat(energyStats.todayKwh) : 0;
  const yesterdayKwh = energyStats?.yesterdayKwh ? parseFloat(energyStats.yesterdayKwh) : 0;
  const isUsageHigher = todayKwh >= yesterdayKwh;
  const percentageDiff = yesterdayKwh > 0
    ? Math.min(100, Math.abs(Math.round(((todayKwh - yesterdayKwh) / yesterdayKwh) * 100)))
    : (todayKwh > 0 ? 100 : 0);

  const sparklineData = energyStats?.history60m && energyStats.history60m.length > 0 
    ? energyStats.history60m 
    : Array(60).fill(0);
    
  const svgPath = generateSparkline(sparklineData, 200, 60);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
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
            <div className="rounded-2xl bg-background/50 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground truncate">
                <Thermometer className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{indoorRoom}</span>
              </div>
              <p className="mt-2 font-display text-2xl font-semibold">{indoorTemp}°C</p>
              <p className="text-xs text-muted-foreground truncate">{indoorHum}</p>
            </div>
            <div className="rounded-2xl bg-background/50 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <SunEventIcon className="h-3.5 w-3.5" /> {sunLabel}
              </div>
              <p className="mt-2 font-display text-2xl font-semibold">{sunTimeStr}</p>
              <p className="text-xs text-muted-foreground">{sunSubLabel}</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-6 flex flex-col relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Energy today
            </p>
            <div className={cn(
              "flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider",
              isUsageHigher ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-500"
            )}>
              {isUsageHigher ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              <span>{percentageDiff}%</span>
            </div>
          </div>
          
          <div className="mt-2">
            <p className="font-display text-5xl font-semibold tracking-tight">
              {todayKwh.toFixed(2)}<span className="text-xl text-muted-foreground font-medium ml-1">kWh</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              Live power: <span className="font-medium text-foreground">{Math.round(currentTotalPower)} W</span>
            </p>
          </div>

          <div className="mt-6 h-16 w-full relative z-10">
            <svg viewBox="0 0 200 60" className="w-full h-full overflow-visible" preserveAspectRatio="none">
              <defs>
                <linearGradient id="sparkline-gradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d={`${svgPath} L 200,60 L 0,60 Z`}
                fill="url(#sparkline-gradient)"
                className="transition-all duration-1000"
              />
              <path
                d={svgPath}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-all duration-1000 drop-shadow-sm"
              />
            </svg>
          </div>

          <div className="mt-auto pt-4 border-t border-border/40">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Usage is <span className={cn("font-medium", isUsageHigher && todayKwh > 0 ? "text-destructive" : "text-emerald-500")}>
                {percentageDiff}% {isUsageHigher ? "higher" : "lower"}
              </span> than yesterday.
            </p>
          </div>
        </GlassCard>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 w-full">
          <h2 className="font-display text-xl font-semibold shrink-0">Quick scenes</h2>
          <div className="flex-1 flex justify-end">
            {scenes.length > 0 ? (
              <RoomFilter rooms={sceneNames} active={activeSceneName} onChange={handleSceneTrigger} />
            ) : (
              <p className="text-sm text-muted-foreground px-2">No scenes yet</p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 w-full">
          <h2 className="font-display text-xl font-semibold shrink-0">Devices</h2>
          <div className="flex-1 flex justify-end">
            <RoomFilter rooms={roomNames} active={activeRoomName} onChange={setActiveRoomName} />
          </div>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
          {isLoadingDevices ? (
            <p className="col-span-full text-center py-10 text-muted-foreground">Loading devices...</p>
          ) : filteredDevices.length === 0 ? (
             <p className="col-span-full text-center py-10 text-muted-foreground">No devices found in {activeRoomName}.</p>
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
                  onClick={() => navigate(`/devices?select=${encodeURIComponent(d.friendly_name)}`)}
                  onToggle={(e: any) => {
                    if (e && e.stopPropagation) e.stopPropagation();
                    handleToggle(d.friendly_name);
                  }}
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