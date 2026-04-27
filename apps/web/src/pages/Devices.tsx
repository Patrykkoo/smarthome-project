import { useState } from "react";
import { Lightbulb, Snowflake, Speaker, Camera, Wind, Tv, Power, Clock } from "lucide-react";
import { GlassCard } from "@/components/livora/GlassCard";
import { DeviceTile } from "@/components/livora/DeviceTile";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const rooms = [
  { name: "Living room", count: 6 },
  { name: "Kitchen", count: 4 },
  { name: "Bedroom", count: 5 },
  { name: "Bathroom", count: 2 },
  { name: "Entrance", count: 3 },
];

const devicesByRoom: Record<string, any[]> = {
  "Living room": [
    { id: 1, icon: Lightbulb, name: "Ambient Lights", value: "78", unit: "%", enabled: true },
    { id: 2, icon: Snowflake, name: "Climate", value: "21.5", unit: "°C", enabled: true },
    { id: 3, icon: Speaker, name: "Soundbar", value: "32", unit: "%", enabled: false },
    { id: 4, icon: Tv, name: "OLED TV", value: "Off", enabled: false },
  ],
  Kitchen: [
    { id: 5, icon: Lightbulb, name: "Strip Lights", value: "60", unit: "%", enabled: true },
    { id: 6, icon: Wind, name: "Hood Fan", value: "Auto", enabled: true },
  ],
  Bedroom: [
    { id: 7, icon: Lightbulb, name: "Bedside", value: "20", unit: "%", enabled: true },
    { id: 8, icon: Wind, name: "Ceiling Fan", value: "Auto", enabled: false },
  ],
  Bathroom: [{ id: 9, icon: Lightbulb, name: "Mirror Light", value: "100", unit: "%", enabled: true }],
  Entrance: [{ id: 10, icon: Camera, name: "Front Camera", value: "Live", enabled: true }],
};

const Devices = () => {
  const [activeRoom, setActiveRoom] = useState("Living room");
  const [brightness, setBrightness] = useState([78]);
  const [lightOn, setLightOn] = useState(true);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="font-display text-3xl font-semibold">Devices & Rooms</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage every connected device room by room.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_360px] gap-6">
        {/* Rooms list */}
        <GlassCard className="p-3 h-fit">
          <ul className="space-y-1">
            {rooms.map((r) => (
              <li key={r.name}>
                <button
                  onClick={() => setActiveRoom(r.name)}
                  className={cn(
                    "w-full flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition-colors",
                    r.name === activeRoom
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground/70 hover:text-foreground hover:bg-muted/60",
                  )}
                >
                  <span>{r.name}</span>
                  <span className="text-xs opacity-70">{r.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </GlassCard>

        {/* Devices grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 content-start">
          {(devicesByRoom[activeRoom] || []).map((d) => (
            <DeviceTile
              key={d.id}
              icon={d.icon}
              name={d.name}
              room={activeRoom}
              value={d.value}
              unit={d.unit}
              enabled={d.enabled}
              onToggle={() => {}}
            />
          ))}
        </div>

        {/* Detail panel */}
        <GlassCard variant="strong" className="p-6 h-fit space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{activeRoom}</p>
              <h3 className="font-display text-2xl font-semibold">Ambient Lights</h3>
            </div>
            <Switch checked={lightOn} onCheckedChange={setLightOn} />
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-accent/30 to-brand-mist/30 p-8 flex items-center justify-center">
            <Lightbulb className="h-20 w-20 text-foreground" strokeWidth={1.2} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Brightness</span>
              <span className="font-display text-lg font-semibold">{brightness[0]}%</span>
            </div>
            <Slider value={brightness} onValueChange={setBrightness} max={100} step={1} />
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Color preset</p>
            <div className="flex gap-2">
              {["#F7E6B8", "#FFFFFF", "#C7E0FF", "#E8C7FF", "#FFC7C7"].map((c) => (
                <button
                  key={c}
                  className="h-9 w-9 rounded-full border-2 border-white shadow-sm"
                  style={{ background: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-background/60 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" /> Start
              </div>
              <p className="mt-1 font-display text-base font-semibold">19:30</p>
            </div>
            <div className="rounded-2xl bg-background/60 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" /> End
              </div>
              <p className="mt-1 font-display text-base font-semibold">23:00</p>
            </div>
          </div>

          <button className="w-full rounded-full bg-primary text-primary-foreground py-3 text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition">
            <Power className="h-4 w-4" /> Apply schedule
          </button>
        </GlassCard>
      </div>
    </div>
  );
};

export default Devices;
