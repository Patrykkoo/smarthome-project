import { useState } from "react";
import { Sun, Sparkles, PartyPopper, Moon, Film, Coffee, Plus, Clock } from "lucide-react";
import { GlassCard } from "@/components/livora/GlassCard";
import { Switch } from "@/components/ui/switch";

const scenes = [
  { icon: Sun, name: "Natural", desc: "Bright daylight tone, blinds open", color: "from-yellow-200/50 to-orange-200/30" },
  { icon: Sparkles, name: "Relax", desc: "Warm dimmed lights, soft music", color: "from-pink-200/50 to-purple-200/30" },
  { icon: PartyPopper, name: "Party", desc: "Color cycle, full speakers", color: "from-purple-300/50 to-fuchsia-200/30" },
  { icon: Film, name: "Movie Night", desc: "Lights 10%, TV on, blinds shut", color: "from-blue-200/50 to-indigo-200/30" },
  { icon: Moon, name: "Goodnight", desc: "All off, alarm armed, AC 19°", color: "from-slate-300/40 to-blue-200/30" },
  { icon: Coffee, name: "Morning", desc: "Kitchen warm, blinds 50%, coffee on", color: "from-amber-200/50 to-yellow-100/30" },
];

const automations = [
  { id: 1, name: "Sunset → warm lights", desc: "Every day at sunset, set living room to Relax", enabled: true },
  { id: 2, name: "Motion → entrance light", desc: "When motion detected after 21:00", enabled: true },
  { id: 3, name: "Leaving home", desc: "When everyone away, run Goodnight scene", enabled: false },
  { id: 4, name: "Wake up", desc: "Weekdays 06:45, run Morning scene", enabled: true },
];

const Scenes = () => {
  const [active, setActive] = useState("Natural");
  const [autos, setAutos] = useState(automations);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Scenes & Automations</h1>
          <p className="text-sm text-muted-foreground mt-1">One tap to set the mood. Rules to do it for you.</p>
        </div>
        <button className="rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium flex items-center gap-2 hover:opacity-90 transition">
          <Plus className="h-4 w-4" /> Create scene
        </button>
      </div>

      {/* Scenes grid */}
      <section>
        <h2 className="font-display text-xl font-semibold mb-4">Scenes</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {scenes.map((s) => {
            const isActive = s.name === active;
            return (
              <GlassCard
                key={s.name}
                variant={isActive ? "strong" : "default"}
                hover
                className="p-6 cursor-pointer relative overflow-hidden"
                onClick={() => setActive(s.name)}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${s.color} opacity-${isActive ? "100" : "60"} pointer-events-none`} />
                <div className="relative">
                  <div className="flex items-start justify-between">
                    <div className="h-12 w-12 rounded-2xl bg-white/70 flex items-center justify-center">
                      <s.icon className="h-5 w-5 text-foreground" />
                    </div>
                    {isActive && (
                      <span className="rounded-full bg-primary text-primary-foreground text-xs px-3 py-1 font-medium">
                        Active
                      </span>
                    )}
                  </div>
                  <h3 className="mt-6 font-display text-xl font-semibold">{s.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{s.desc}</p>
                </div>
              </GlassCard>
            );
          })}
        </div>
      </section>

      {/* Automations */}
      <section>
        <h2 className="font-display text-xl font-semibold mb-4">Automations</h2>
        <GlassCard className="p-2">
          <ul className="divide-y divide-border/60">
            {autos.map((a) => (
              <li key={a.id} className="flex items-center gap-4 p-4">
                <div className="h-10 w-10 rounded-2xl bg-muted flex items-center justify-center">
                  <Clock className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{a.name}</p>
                  <p className="text-sm text-muted-foreground truncate">{a.desc}</p>
                </div>
                <Switch
                  checked={a.enabled}
                  onCheckedChange={(v) =>
                    setAutos((prev) => prev.map((x) => (x.id === a.id ? { ...x, enabled: v } : x)))
                  }
                />
              </li>
            ))}
          </ul>
        </GlassCard>
      </section>
    </div>
  );
};

export default Scenes;
