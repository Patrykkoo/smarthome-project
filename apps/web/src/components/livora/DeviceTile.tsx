import { LucideIcon, Trash2, Pencil } from "lucide-react";
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
  onDelete?: () => void;
  onRename?: () => void; // <--- Nowy prop
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
  onDelete,
  onRename,
  accent,
  className,
}: DeviceTileProps) {
  return (
    <GlassCard
      hover
      className={cn(
        "p-5 flex flex-col gap-4 min-h-[180px] relative",
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

      <div className="mt-auto relative">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{room}</p>
        
        {/* Kontener nazwy + przycisk edycji */}
        <div className="flex items-center gap-2 mt-1">
          <h3 className="text-base font-semibold text-foreground truncate max-w-[85%]">{name}</h3>
          {onRename && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRename();
              }}
              className="text-muted-foreground opacity-40 hover:opacity-100 hover:text-foreground transition-all"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {value && (
          <p className="mt-2 font-display text-2xl font-semibold text-foreground">
            {value}
            {unit && <span className="ml-1 text-sm font-medium text-muted-foreground">{unit}</span>}
          </p>
        )}

        {onDelete && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete();
            }}
            className="absolute right-0 bottom-0 p-2 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </GlassCard>
  );
}