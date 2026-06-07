import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricBadgeProps {
  value: number;
  className?: string;
  inverted?: boolean;
}

export function MetricBadge({ value, className, inverted = false }: MetricBadgeProps) {
  const positive = inverted ? value < 0 : value > 0;
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        positive
          ? "bg-accent/30 text-foreground"
          : "bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {value > 0 ? "+" : ""}
      {value}%
    </span>
  );
}
