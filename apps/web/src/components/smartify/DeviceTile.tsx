import { LucideIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { GlassCard } from "./GlassCard";
import { cn } from "@/lib/utils";

interface DeviceTileProps {
  icon: LucideIcon;
  name: string;
  room: string;
  statusLabel?: string;
  statusColor?: string;
  value?: string;
  unit?: string;
  livePulse?: boolean;
  enabled: boolean;
  offline?: boolean;
  showSwitch?: boolean;
  onToggle?: (v: boolean) => void;
  onClick?: () => void;
  accent?: boolean;
  selected?: boolean;
  iconColor?: string;
  className?: string;
}

export function DeviceTile({
  icon: Icon, name, room, statusLabel, statusColor, value, unit, livePulse, enabled, offline, showSwitch = true,
  onToggle, onClick, accent, selected, iconColor, className,
}: DeviceTileProps) {
  return (
    <GlassCard
      onClick={onClick}
      className={cn(
        "p-5 flex flex-col gap-4 aspect-square min-h-[160px] transition-all duration-300",
        onClick && "cursor-pointer",
        accent && enabled && !offline && "ring-1 ring-accent/40",
        selected && "ring-2 ring-primary/60",
        offline && "opacity-60",
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-2xl transition-colors",
            offline ? "bg-muted text-muted-foreground/50" : 
            enabled
              ? iconColor ? "text-primary-foreground" : "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
          style={enabled && iconColor && !offline ? { backgroundColor: iconColor } : undefined}
        >
          <Icon className="h-5 w-5" />
        </div>
        
        {showSwitch && (
          <div onClick={(e) => { e.stopPropagation(); if (offline) e.preventDefault(); }}>
            <Switch checked={enabled && !offline} disabled={offline} onCheckedChange={onToggle} />
          </div>
        )}
      </div>

      <div className="mt-auto">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{room}</p>
        <h3 className="mt-1 text-base font-semibold text-foreground truncate">{name}</h3>
        
        {value !== undefined && !offline && (
          <p className="mt-2 font-display text-2xl font-semibold text-foreground">
            {value}
            {unit && <span className="ml-1 text-sm font-medium text-muted-foreground">{unit}</span>}
          </p>
        )}

        <div className={cn("inline-flex items-center gap-2 text-sm text-muted-foreground", value !== undefined && !offline ? "mt-1" : "mt-2")}>
          {offline ? (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
              <span className="font-medium text-destructive/80">Offline</span>
            </>
          ) : (
            <>
              {livePulse ? (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ backgroundColor: statusColor || '#3b82f6' }} />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColor || '#3b82f6' }} />
                </span>
              ) : (
                statusColor && enabled && (
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: statusColor }}
                  />
                )
              )}
              <span className={cn("font-medium", value !== undefined ? "text-muted-foreground" : "text-foreground/80")}>
                {statusLabel}
              </span>
            </>
          )}
        </div>
      </div>
    </GlassCard>
  );
}