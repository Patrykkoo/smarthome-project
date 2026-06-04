import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScenePillProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export function ScenePill({ icon: Icon, label, active, onClick, className }: ScenePillProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-all duration-200",
        active
          ? "bg-primary text-primary-foreground"
          : "glass glass-hover text-foreground",
        className,
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
