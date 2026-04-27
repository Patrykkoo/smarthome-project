import { LucideIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { GlassCard } from "./GlassCard";
import { cn } from "@/lib/utils";

interface DeviceTileProps {
  icon: LucideIcon;
  name: string;
  room: string;
  value?: string;
  unit?: string;
  enabled: boolean;
  onToggle?: (v: boolean) => void;
  accent?: boolean;
  className?: string;
}

export function DeviceTile({
  icon: Icon,
  name,
  room,
  value,
  unit,
  enabled,
  onToggle,
  accent,
  className,
}: DeviceTileProps) {
  return (
    <GlassCard
      hover
      className={cn(
        "p-5 flex flex-col gap-4 min-h-[180px]",
        accent && enabled && "ring-1 ring-accent/40",
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-2xl transition-colors",
            enabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>

      <div className="mt-auto">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{room}</p>
        <h3 className="mt-1 text-base font-semibold text-foreground">{name}</h3>
        {value && (
          <p className="mt-2 font-display text-2xl font-semibold text-foreground">
            {value}
            {unit && <span className="ml-1 text-sm font-medium text-muted-foreground">{unit}</span>}
          </p>
        )}
      </div>
    </GlassCard>
  );
}
