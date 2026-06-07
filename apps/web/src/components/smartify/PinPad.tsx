import { LucideIcon, Delete } from "lucide-react";
import { GlassCard } from "@/components/smartify/GlassCard";
import { cn } from "@/lib/utils";

interface PinPadProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  error?: boolean;
  pin: string;
  length?: number;
  secondaryLabel: string;
  onSecondary: () => void;
  onDigit: (digit: number) => void;
  onBackspace: () => void;
}

export function PinPad({
  icon: Icon,
  title,
  subtitle,
  error = false,
  pin,
  length = 6,
  secondaryLabel,
  onSecondary,
  onDigit,
  onBackspace,
}: PinPadProps) {
  return (
    <GlassCard
      onClick={(e) => e.stopPropagation()}
      className="w-full max-w-sm p-8 short:p-5 shorter:p-4 relative z-10 animate-in fade-in zoom-in duration-300"
    >
      <div className="flex flex-col items-center mb-10 short:mb-5 shorter:mb-3">
        <div className="h-16 w-16 short:h-12 short:w-12 bg-primary rounded-3xl flex items-center justify-center text-primary-foreground mb-4 short:mb-2">
          <Icon className="h-8 w-8 short:h-6 short:w-6" />
        </div>
        <h1 className="font-display text-2xl short:text-xl font-semibold text-center leading-tight">{title}</h1>
        <p className={cn("mt-1 text-sm transition-colors", error ? "text-destructive font-medium" : "text-muted-foreground")}>
          {subtitle}
        </p>
      </div>

      <div className="flex justify-center gap-4 mb-10 short:mb-5 shorter:mb-3 h-4">
        {[...Array(length)].map((_, i) => (
          <div
            key={i}
            className={cn(
              "w-3.5 h-3.5 rounded-full transition-all duration-300",
              i < pin.length ? "bg-primary scale-110" : "bg-muted border border-border/50",
            )}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4 short:gap-2.5 shorter:gap-2 max-w-[280px] mx-auto">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button
            key={n}
            onClick={() => onDigit(n)}
            className="h-16 short:h-12 shorter:h-11 rounded-full bg-background/60 hover:bg-background border border-white/5 text-2xl short:text-xl font-display font-semibold active:scale-95 transition-transform focus-visible:ring-0 outline-none shadow-sm"
          >
            {n}
          </button>
        ))}
        <button
          onClick={onSecondary}
          className="h-16 short:h-12 shorter:h-11 rounded-full text-muted-foreground font-semibold hover:bg-background/40 active:scale-95 transition-transform outline-none focus-visible:ring-0 uppercase text-sm tracking-wider"
        >
          {secondaryLabel}
        </button>
        <button
          onClick={() => onDigit(0)}
          className="h-16 short:h-12 shorter:h-11 rounded-full bg-background/60 hover:bg-background border border-white/5 text-2xl short:text-xl font-display font-semibold active:scale-95 transition-transform outline-none focus-visible:ring-0 shadow-sm"
        >
          0
        </button>
        <button
          onClick={onBackspace}
          className="h-16 short:h-12 shorter:h-11 rounded-full text-muted-foreground flex items-center justify-center hover:bg-background/40 active:scale-95 transition-transform outline-none focus-visible:ring-0"
        >
          <Delete className="h-6 w-6" />
        </button>
      </div>
    </GlassCard>
  );
}