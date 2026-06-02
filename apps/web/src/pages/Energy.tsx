import { useState, useMemo, useEffect } from "react";
import { Zap, Plug, Lightbulb, Thermometer, Clock, Droplets, Lock, TrendingUp, TrendingDown, Activity, DollarSign } from "lucide-react";
import { GlassCard } from "@/components/livora/GlassCard";
import { TimeframeToggle, TimeframeMode } from "@/components/livora/TimeframeToggle";
import { useDevices } from "@/hooks/use-devices";
import { useWebSockets } from "@/hooks/use-websockets";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { cn } from "@/lib/utils";

const API_URL = import.meta.env.VITE_API_URL;

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

const Energy = () => {
  const [timeframe, setTimeframe] = useState<TimeframeMode>("week");
  const [selectedBar, setSelectedBar] = useState<number | null>(null);

  // Pobieranie globalnych ustawień z localStorage
  const energyRate = parseFloat(localStorage.getItem('livora_energy_rate') || '1.15');
  const currency = localStorage.getItem('livora_currency') || 'PLN';

  const { data: devices = [] } = useDevices();
  const { socket } = useWebSockets();
  const [localLiveData, setLocalLiveData] = useState<Record<string, any>>({});

  const { data: energyStats } = useQuery({
    queryKey: ['energyStats'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/energy/stats`);
      return res.data;
    },
    refetchInterval: 60 * 1000 
  });

  const { data: historyData } = useQuery({
    queryKey: ['energyHistory', timeframe],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/energy/history/${timeframe}`);
      return res.data;
    }
  });

  useEffect(() => {
    setSelectedBar(null);
  }, [timeframe]);

  useEffect(() => {
    if (!socket) return;
    const handleUpdate = (data: any) => {
      setLocalLiveData(prev => ({ ...prev, [data.friendlyName]: { ...prev[data.friendlyName], ...data.payload } }));
    };
    socket.on('device_state_update', handleUpdate);
    return () => { socket.off('device_state_update', handleUpdate); };
  }, [socket]);

  useEffect(() => {
    if (devices.length > 0) {
      setLocalLiveData(prev => {
        let hasChanges = false;
        const next = { ...prev };
        devices.forEach((d: any) => {
          if (d.last_payload && !next[d.friendly_name]) {
            next[d.friendly_name] = { ...d.last_payload };
            hasChanges = true;
          }
        });
        return hasChanges ? next : prev;
      });
    }
  }, [devices]);

  const currentTotalPower = devices.reduce((sum: number, d: any) => {
    const live = localLiveData[d.friendly_name] || d.last_payload || {};
    const isOffline = live.state === 'OFFLINE' || live.state === 'offline' || live.availability === 'offline';
    if (!isOffline && live.state === "ON" && live.power) return sum + live.power;
    return sum;
  }, 0);

  const activeDevicesList = useMemo(() => {
    return devices.filter((d: any) => {
      const live = localLiveData[d.friendly_name] || d.last_payload || {};
      const isOffline = live.state === 'OFFLINE' || live.state === 'offline' || live.availability === 'offline';
      return !isOffline && live.state === "ON" && (live.power || 0) > 0;
    }).map((d: any) => {
      const live = localLiveData[d.friendly_name] || d.last_payload || {};
      return {
        id: d.id,
        name: d.friendly_name,
        room: d.room_name || "Unassigned",
        power: live.power || 0
      };
    }).sort((a: any, b: any) => b.power - a.power);
  }, [devices, localLiveData]);

  const activeConsumersCount = activeDevicesList.length;

  const todayKwh = energyStats?.todayKwh ? parseFloat(energyStats.todayKwh) : 0;
  const yesterdayKwh = energyStats?.yesterdayKwh ? parseFloat(energyStats.yesterdayKwh) : 0;
  const isUsageHigher = todayKwh >= yesterdayKwh;
  const percentageDiff = yesterdayKwh > 0 ? Math.abs(Math.round(((todayKwh - yesterdayKwh) / yesterdayKwh) * 100)) : (todayKwh > 0 ? 100 : 0);

  const fallbackSparkline = useMemo(() => {
    let lastVal = currentTotalPower || 100;
    return Array.from({ length: 60 }, () => {
      lastVal = Math.max(0, lastVal + (Math.random() - 0.5) * 20);
      return lastVal;
    });
  }, [currentTotalPower]);

  const sparklineData = energyStats?.history60m && energyStats.history60m.length >= 2 ? energyStats.history60m : fallbackSparkline;
  const svgPath = generateSparkline(sparklineData, 200, 60);

  const realDevicesWithEnergy = useMemo(() => {
    return devices.map((d: any) => {
      const live = localLiveData[d.friendly_name] || d.last_payload || {};
      const energyValue = Number(live.energy ?? live.consumption ?? live.total_energy ?? 0);
      
      let icon = Plug;
      if (live.temperature !== undefined) icon = Thermometer;
      else if (live.water_leak !== undefined) icon = Droplets;
      else if (live.contact !== undefined) icon = Lock;
      else if (live.brightness !== undefined) icon = Lightbulb;

      return { id: d.id, name: d.friendly_name, room: d.room_name || "Unassigned", baseKwh: energyValue, icon: icon };
    }).filter((d: any) => d.baseKwh > 0).sort((a: any, b: any) => b.baseKwh - a.baseKwh);
  }, [devices, localLiveData]);

  const totalRealKwh = realDevicesWithEnergy.reduce((sum: number, d: any) => sum + d.baseKwh, 0);
  
  const timeframeKwh = historyData?.totalKwh || 0;
  const timeframeCost = timeframeKwh * energyRate;

  const daysDivider = timeframe === 'week' ? 7 : timeframe === 'month' ? 30 : 365;
  const avgDailyKwh = timeframeKwh / daysDivider;

  const chartData = useMemo(() => {
    if (historyData?.chart && historyData.chart.length > 0) return historyData.chart;
    
    if (timeframe === "week") {
      return [
        { label: "Mon", value: 0 }, { label: "Tue", value: 0 }, { label: "Wed", value: 0 },
        { label: "Thu", value: 0 }, { label: "Fri", value: 0 }, { label: "Sat", value: 0 }, { label: "Sun", value: 0 }
      ];
    } else if (timeframe === "month") {
      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      return Array.from({ length: daysInMonth }, (_, i) => ({ label: (i + 1).toString(), value: 0 }));
    } else {
      return [
        { label: "Jan", value: 0 }, { label: "Feb", value: 0 }, { label: "Mar", value: 0 },
        { label: "Apr", value: 0 }, { label: "May", value: 0 }, { label: "Jun", value: 0 },
        { label: "Jul", value: 0 }, { label: "Aug", value: 0 }, { label: "Sep", value: 0 },
        { label: "Oct", value: 0 }, { label: "Nov", value: 0 }, { label: "Dec", value: 0 }
      ];
    }
  }, [historyData, timeframe]);

  const maxValueInChart = Math.max(...chartData.map((d: any) => d.value));
  const maxChartValue = maxValueInChart > 0 ? maxValueInChart : 1;

  // Obliczenie aktualnego kosztu
  const totalCost = todayKwh * energyRate;

  return (
    <div className="max-w-[1400px] mx-auto pb-10 flex flex-col gap-6">
      
      {/* NAGŁÓWEK */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Energy Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">Track your power consumption.</p>
        </div>
        <TimeframeToggle initialMode={timeframe} onChange={setTimeframe} className="self-end sm:self-auto shrink-0" />
      </div>

      {/* GÓRNY RZĄD */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-4">
        
        <GlassCard className="p-6 flex flex-col relative overflow-hidden group lg:col-span-5 min-h-[260px] lg:h-[260px]">
          <div className="flex items-center justify-between z-10">
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
          
          <div className="mt-2 z-10">
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
              <path d={`${svgPath} L 200,60 L 0,60 Z`} fill="url(#sparkline-gradient)" className="transition-all duration-1000" />
              <path d={svgPath} fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-all duration-1000 drop-shadow-sm" />
            </svg>
          </div>

          <div className="mt-auto pt-4 border-t border-border/40 z-10">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Usage is <span className={cn("font-medium", isUsageHigher && todayKwh > 0 ? "text-destructive" : "text-emerald-500")}>
                {percentageDiff}% {isUsageHigher ? "higher" : "lower"}
              </span> than yesterday.
            </p>
          </div>
        </GlassCard>

        <div className="flex flex-col justify-between gap-4 lg:col-span-3 min-h-[260px] lg:h-[260px]">
          <GlassCard className="px-5 py-4 flex-1 flex flex-col justify-center">
            <p className="text-sm font-medium flex items-center gap-2 text-foreground">
              <Plug className="h-4 w-4" /> Usage {timeframe === 'week' ? 'this week' : timeframe === 'month' ? 'this month' : 'this year'}
            </p>
            <div className="mt-1">
              <p className="font-display text-4xl font-semibold tracking-tight">
                {timeframeKwh.toFixed(2)}<span className="text-lg text-muted-foreground font-medium ml-1">kWh</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Average {avgDailyKwh.toFixed(2)} kWh/day
              </p>
            </div>
          </GlassCard>

          <GlassCard className="px-5 py-4 flex-1 flex flex-col justify-center">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <DollarSign className="h-4 w-4" /> Est. Cost
              </div>
            </div>
            <div className="mt-1">
              <p className="font-display text-4xl font-semibold tracking-tight">
                {currency} {totalCost.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Based on {energyRate} {currency}/kWh</p>
            </div>
          </GlassCard>
        </div>

        {/* AKTYWNE URZĄDZENIA */}
        <GlassCard className="p-5 lg:col-span-2 min-h-[260px] lg:h-[260px] flex flex-col">
           <div className="flex items-center justify-between shrink-0">
              <p className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" /> Active Now
              </p>
            </div>
            <div className="mt-2 shrink-0">
              <p className="font-display text-5xl font-semibold tracking-tighter leading-none">
                {activeConsumersCount}
              </p>
              <p className="text-xs text-muted-foreground font-medium tracking-wider mt-1.5">
                Devices drawing power
              </p>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto no-scrollbar min-h-0 flex flex-col gap-2 relative">
              {activeDevicesList.length > 0 ? (
                activeDevicesList.map((dev: any) => (
                  <div key={dev.id} className="flex items-center justify-between py-1 border-t border-white/5 first:border-0 first:pt-0 shrink-0">
                    <div className="flex items-center gap-3 pl-1 pr-2">
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                      </span>
                      <div>
                        <p className="font-semibold text-sm leading-tight text-foreground/90">{dev.name}</p>
                        <p className="text-[10px] text-muted-foreground uppercase mt-0.5">{dev.room}</p>
                      </div>
                    </div>
                    <span className="font-display text-base font-bold text-foreground/90 shrink-0">
                      {Math.round(dev.power)} <span className="text-[10px] font-medium text-muted-foreground uppercase">W</span>
                    </span>
                  </div>
                ))
              ) : (
                <div className="h-full flex items-center justify-center opacity-50">
                  <p className="text-xs text-muted-foreground text-center">No devices active</p>
                </div>
              )}
            </div>
        </GlassCard>
      </div>

      {/* WYKRES SŁUPKOWY */}
      <GlassCard className="p-6 flex flex-col justify-between min-h-[260px] lg:h-[260px]">
        <h2 className="font-display text-xl font-semibold shrink-0">Consumption History</h2>
        
        <div className="relative w-full flex-1 overflow-x-auto no-scrollbar mt-2" style={{ touchAction: 'pan-x' }}>
          <div className={cn("flex items-end h-full pt-12 pb-3", timeframe === 'month' ? "w-max gap-3 sm:gap-4 px-2" : "min-w-full justify-between gap-4 px-2")}>
            
            {chartData.map((data: any, index: number) => {
              const height = maxChartValue > 0 ? (data.value / maxChartValue) * 100 : 0;
              const isSelected = selectedBar === index;
              const isAnySelected = selectedBar !== null;
              const barClass = isAnySelected 
                ? (isSelected ? "bg-primary shadow-[0_0_15px_rgba(var(--primary),0.4)]" : "bg-primary/25") 
                : "bg-primary/90 hover:bg-primary";

              const isFirst = index === 0;
              const isLast = index === chartData.length - 1;

              return (
                <div 
                  key={index} 
                  onClick={() => setSelectedBar(isSelected ? null : index)}
                  className={cn(
                    "flex flex-col items-center justify-end cursor-pointer group shrink-0 relative h-full",
                    timeframe === 'month' ? "w-8" : "w-[48px]"
                  )}
                >
                  <div className="w-full relative flex items-end h-[90px]">
                    <div 
                      className={cn("w-full rounded-t-xl transition-all duration-500 ease-out relative", barClass)} 
                      style={{ height: data.value > 0 ? `max(4px, ${height}%)` : '4px' }}
                    >
                      <div className={cn(
                        "absolute bottom-full mb-2 flex flex-col items-center transition-all duration-300 z-20",
                        isFirst ? "left-0 translate-x-0" : isLast ? "right-0 translate-x-0" : "left-1/2 -translate-x-1/2",
                        isSelected ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
                      )}>
                        <div className="bg-foreground text-background px-3 py-1.5 rounded-xl shadow-xl flex flex-col items-center border border-white/10 relative">
                          <span className="font-display font-bold text-sm leading-none whitespace-nowrap">
                            {data.value > 0 ? data.value.toFixed(2) : '0.00'} <span className="text-[10px] font-medium opacity-70">kWh</span>
                          </span>
                        </div>
                        <div className={cn(
                          "w-2.5 h-2.5 bg-foreground rotate-45 -mt-1.5 rounded-sm absolute bottom-0 -mb-1",
                          isFirst ? "left-3" : isLast ? "right-3" : "left-1/2 -translate-x-1/2"
                        )} />
                      </div>
                    </div>
                  </div>
                  
                  <span className={cn(
                    "text-[10px] sm:text-xs font-semibold mt-4 uppercase whitespace-nowrap transition-colors duration-300",
                    isAnySelected ? (isSelected ? "text-foreground" : "text-muted-foreground/50") : "text-muted-foreground"
                  )}>
                    {data.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </GlassCard>

      {/* LISTA URZĄDZEŃ I ROZKŁAD */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
        <GlassCard className="p-6">
          <h2 className="font-display text-xl font-semibold mb-6">Device Breakdown</h2>
          <div className="space-y-2">
            {realDevicesWithEnergy.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No devices reporting energy consumption yet.</p>
            ) : (
              realDevicesWithEnergy.map((device: any) => (
                <div key={device.id} className="flex items-center justify-between p-3 rounded-2xl glass hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 shrink-0 rounded-full bg-background/50 border border-white/10 flex items-center justify-center text-foreground"><device.icon className="h-4 w-4" /></div>
                    <div><p className="font-semibold text-sm leading-tight">{device.name}</p><p className="text-[10px] text-muted-foreground uppercase mt-0.5">{device.room}</p></div>
                  </div>
                  <p className="font-display text-base font-bold">{device.baseKwh.toFixed(2)} <span className="text-[10px] font-medium text-muted-foreground">kWh</span></p>
                </div>
              ))
            )}
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <h2 className="font-display text-xl font-semibold mb-8">Distribution</h2>
          <div className="space-y-5">
            {realDevicesWithEnergy.slice(0, 6).map((device: any) => {
              const percentage = totalRealKwh > 0 ? (device.baseKwh / totalRealKwh) * 100 : 0;
              return (
                <div key={device.id}>
                  <div className="flex justify-between items-end mb-1.5"><span className="text-sm font-semibold truncate">{device.name}</span><span className="text-xs font-bold text-muted-foreground">{percentage.toFixed(1)}%</span></div>
                  <div className="h-2 w-full bg-muted/40 rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full transition-all duration-1000" style={{ width: `${percentage}%` }} /></div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      </div>

    </div>
  );
};

export default Energy;