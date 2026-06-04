import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ColorWheelProps {
  hue: number;        // 0..360
  saturation: number; // 0..100
  onChange: (hue: number, saturation: number) => void;
  className?: string;
}

export function ColorWheel({ hue, saturation, onChange, className }: ColorWheelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const radius = rect.width / 2;
      const dist = Math.min(Math.sqrt(dx * dx + dy * dy), radius);
      const sat = Math.round((dist / radius) * 100);
      // atan2 mierzy kąt od godziny 3:00 (prawa) zgodnie z ruchem wskazówek,
      // a tło to conic-gradient liczony od godziny 12:00 (góra). Różnica to +90°.
      // Bez tego korekcji wybrany odcień był przesunięty względem widocznego koloru.
      let angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      angle = ((angle % 360) + 360) % 360;
      onChange(Math.round(angle), sat);
    },
    [onChange],
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => handleFromEvent(e.clientX, e.clientY);
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, handleFromEvent]);

  // Lustrzane przesunięcie -90°, by kropka stała w miejscu, gdzie gradient
  // faktycznie pokazuje dany odcień (gradient liczony od góry, ekran od prawej).
  const angleRad = ((hue - 90) * Math.PI) / 180;
  const r = saturation / 100;
  const thumbX = 50 + Math.cos(angleRad) * r * 50;
  const thumbY = 50 + Math.sin(angleRad) * r * 50;

  return (
    <div
      ref={ref}
      className={cn(
        "relative aspect-square w-full max-w-[260px] mx-auto rounded-full cursor-crosshair touch-none select-none",
        className,
      )}
      style={{
        background:
          "conic-gradient(from 0deg, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))",
        boxShadow: "inset 0 0 0 1px hsl(var(--border) / 0.4), 0 8px 24px -12px hsl(var(--foreground) / 0.25)",
      }}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        setDragging(true);
        handleFromEvent(e.clientX, e.clientY);
      }}
    >
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle at center, hsl(0 0% 100%) 0%, hsl(0 0% 100% / 0) 100%)" }}
      />
      <div
        className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md pointer-events-none"
        style={{
          left: `${thumbX}%`,
          top: `${thumbY}%`,
          background: `hsl(${hue} 100% ${100 - saturation / 2}%)`,
        }}
      />
    </div>
  );
}