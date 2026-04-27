import { useState } from "react";
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
} from "lucide-react";
import { GlassCard } from "@/components/livora/GlassCard";
import { DeviceTile } from "@/components/livora/DeviceTile";
import { RoomFilter } from "@/components/livora/RoomFilter";
import { ScenePill } from "@/components/livora/ScenePill";
import { MetricBadge } from "@/components/livora/MetricBadge";

const rooms = ["All", "Living room", "Kitchen", "Bedroom", "Bathroom"];

const allDevices = [
  { id: 1, icon: Lightbulb, name: "Ambient Lights", room: "Living room", value: "78", unit: "%", enabled: true, accent: true },
  { id: 2, icon: Snowflake, name: "Climate Control", room: "Living room", value: "21.5", unit: "°C", enabled: true },
  { id: 3, icon: Camera, name: "Front Camera", room: "Entrance", value: "Live", enabled: true },
  { id: 4, icon: Speaker, name: "Bose Soundbar", room: "Living room", value: "32", unit: "%", enabled: false },
  { id: 5, icon: Lightbulb, name: "Kitchen Strip", room: "Kitchen", value: "60", unit: "%", enabled: true },
  { id: 6, icon: Wind, name: "Bedroom Fan", room: "Bedroom", value: "Auto", enabled: false },
];

const Dashboard = () => {
  const [activeRoom, setActiveRoom] = useState("All");
  const [activeScene, setActiveScene] = useState("Natural");
  const [devices, setDevices] = useState(allDevices);

  const toggle = (id: number) =>
    setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, enabled: !d.enabled } : d)));

  const filtered = activeRoom === "All" ? devices : devices.filter((d) => d.room === activeRoom);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <h1 className="sr-only">Livora dashboard</h1>

      {/* Hero + energy strip */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <GlassCard variant="strong" className="lg:col-span-2 p-7 relative overflow-hidden">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Cloud className="h-4 w-4" />
            Partly cloudy · Warsaw
          </div>
          <div className="mt-4 flex items-end gap-4">
            <p className="font-display text-7xl font-semibold leading-none">16.7°</p>
            <div className="pb-2 text-sm text-muted-foreground">
              <p>Feels like 15°</p>
              <p>Humidity 62%</p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-background/50 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <Thermometer className="h-3.5 w-3.5" /> Living room
              </div>
              <p className="mt-2 font-display text-2xl font-semibold">21.5°C</p>
              <p className="text-xs text-muted-foreground">Cooling mode active</p>
            </div>
            <div className="rounded-2xl bg-background/50 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <Sun className="h-3.5 w-3.5" /> Sunset
              </div>
              <p className="mt-2 font-display text-2xl font-semibold">19:47</p>
              <p className="text-xs text-muted-foreground">Lights warm at 19:30</p>
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

          {/* Sparkline */}
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

      {/* Rooms + devices */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-display text-xl font-semibold">Devices</h2>
          <RoomFilter rooms={rooms} active={activeRoom} onChange={setActiveRoom} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((d) => (
            <DeviceTile
              key={d.id}
              icon={d.icon}
              name={d.name}
              room={d.room}
              value={d.value}
              unit={d.unit}
              enabled={d.enabled}
              accent={d.accent}
              onToggle={() => toggle(d.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
