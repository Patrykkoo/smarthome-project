import { useState } from "react";
import { Lightbulb, Snowflake, Camera, Speaker, Tv, Wind } from "lucide-react";
import { GlassCard } from "@/components/livora/GlassCard";
import { MetricBadge } from "@/components/livora/MetricBadge";
import { cn } from "@/lib/utils";

const ranges = ["This week", "This month", "This year"] as const;
type Range = (typeof ranges)[number];

const weekData = [
  { day: "Mon", value: 5.2 },
  { day: "Tue", value: 6.8 },
  { day: "Wed", value: 4.6 },
  { day: "Thu", value: 7.1 },
  { day: "Fri", value: 5.9 },
  { day: "Sat", value: 8.4 },
  { day: "Sun", value: 6.3 },
];

const devices = [
  { icon: Snowflake, name: "AC / Climate", value: 6.8 },
  { icon: Lightbulb, name: "Lights", value: 5.2 },
  { icon: Tv, name: "TV / Media", value: 3.4 },
  { icon: Camera, name: "Cameras", value: 1.1 },
  { icon: Speaker, name: "Speakers", value: 0.8 },
  { icon: Wind, name: "Fans", value: 1.5 },
];

const Energy = () => {
  const [range, setRange] = useState<Range>("This week");
  const max = Math.max(...weekData.map((d) => d.value));
  const total = weekData.reduce((s, d) => s + d.value, 0).toFixed(1);
  const totalDevice = devices.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Energy analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Track consumption across the home.</p>
        </div>
        <div className="glass rounded-full p-1 flex">
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium transition-colors",
                r === range ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:text-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GlassCard className="p-6">
          <p className="text-sm text-muted-foreground">Total usage</p>
          <p className="mt-2 font-display text-4xl font-semibold">
            {total}
            <span className="ml-1 text-base font-medium text-muted-foreground">kWh</span>
          </p>
          <div className="mt-3"><MetricBadge value={-8} inverted /></div>
        </GlassCard>
        <GlassCard className="p-6">
          <p className="text-sm text-muted-foreground">Estimated cost</p>
          <p className="mt-2 font-display text-4xl font-semibold">
            €18.40
          </p>
          <div className="mt-3"><MetricBadge value={-5} inverted /></div>
        </GlassCard>
        <GlassCard className="p-6">
          <p className="text-sm text-muted-foreground">Carbon saved</p>
          <p className="mt-2 font-display text-4xl font-semibold">
            12.4<span className="ml-1 text-base font-medium text-muted-foreground">kg</span>
          </p>
          <div className="mt-3"><MetricBadge value={14} /></div>
        </GlassCard>
      </div>

      {/* Chart */}
      <GlassCard variant="strong" className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-xl font-semibold">Weekly consumption</h2>
          <p className="text-sm text-muted-foreground">kWh per day</p>
        </div>

        <div className="flex items-end justify-between gap-3 h-56">
          {weekData.map((d) => {
            const h = (d.value / max) * 100;
            return (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-2 group">
                <div className="relative w-full flex-1 flex items-end">
                  <div
                    className="w-full rounded-t-2xl bg-gradient-to-t from-brand-graphite to-brand-graphite/70 group-hover:from-brand-sky group-hover:to-brand-sky/70 transition-colors"
                    style={{ height: `${h}%` }}
                  />
                  <span className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity rounded-full bg-primary text-primary-foreground text-xs px-2 py-1 whitespace-nowrap">
                    {d.value} kWh
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">{d.day}</span>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* Devices breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <GlassCard className="p-6 lg:col-span-2">
          <h2 className="font-display text-xl font-semibold mb-4">Usage by device</h2>
          <ul className="space-y-4">
            {devices.map((d) => {
              const pct = (d.value / totalDevice) * 100;
              return (
                <li key={d.name} className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-2xl bg-muted flex items-center justify-center">
                    <d.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{d.name}</span>
                      <span className="font-display font-semibold">{d.value} kWh</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand-graphite to-brand-sky"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </GlassCard>

        <GlassCard variant="strong" className="p-6 space-y-4">
          <h2 className="font-display text-xl font-semibold">Insights</h2>
          <div className="rounded-2xl bg-accent/20 p-4">
            <p className="text-sm font-semibold">Save up to €4.20/week</p>
            <p className="text-xs text-muted-foreground mt-1">
              Lower AC by 1°C between 22:00–06:00 to reduce night load.
            </p>
          </div>
          <div className="rounded-2xl bg-muted/60 p-4">
            <p className="text-sm font-semibold">Lights idle</p>
            <p className="text-xs text-muted-foreground mt-1">
              Kitchen strip stayed on 3h with no motion. Enable auto-off?
            </p>
          </div>
          <div className="rounded-2xl bg-muted/60 p-4">
            <p className="text-sm font-semibold">Peak hour</p>
            <p className="text-xs text-muted-foreground mt-1">
              Most usage between 19:00–21:00. Shift dishwasher to night tariff.
            </p>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

export default Energy;
