import { House, Plane } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Mode = "home" | "away";

interface HomeAwayToggleProps {
  initialMode?: Mode;
  onChange?: (mode: Mode) => void;
  className?: string;
}

export function HomeAwayToggle({ initialMode = "home", onChange, className }: HomeAwayToggleProps) {
  const [mode, setMode] = useState<Mode>(initialMode);

  const trackRef = useRef<HTMLDivElement>(null);
  const homeRef = useRef<HTMLButtonElement>(null);
  const awayRef = useRef<HTMLButtonElement>(null);

  const [rects, setRects] = useState<{
    home: { x: number; w: number };
    away: { x: number; w: number };
  } | null>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number }>({ x: 4, w: 0 });
  const [dragging, setDragging] = useState(false);
  const thumbRef = useRef(thumb);
  const suppressClickRef = useRef(false);
  const dragState = useRef<{ startX: number; baseX: number; moved: boolean } | null>(null);

  const setMeasuredThumb = (next: { x: number; w: number }) => {
    thumbRef.current = next;
    setThumb(next);
  };

  useLayoutEffect(() => {
    const measure = () => {
      const track = trackRef.current;
      const h = homeRef.current;
      const a = awayRef.current;
      if (!track || !h || !a) return;
      const tRect = track.getBoundingClientRect();
      const hRect = h.getBoundingClientRect();
      const aRect = a.getBoundingClientRect();
      setRects({
        home: { x: hRect.left - tRect.left, w: hRect.width },
        away: { x: aRect.left - tRect.left, w: aRect.width },
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (!rects || dragging) return;
    setMeasuredThumb(rects[mode]);
  }, [rects, mode, dragging]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!rects) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = {
      startX: e.clientX,
      baseX: thumbRef.current.x || rects[mode].x,
      moved: false,
    };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current || !rects) return;
    const delta = e.clientX - dragState.current.startX;
    if (Math.abs(delta) > 3) dragState.current.moved = true;
    const minX = rects.home.x;
    const maxX = rects.away.x;
    const nextX = Math.max(minX, Math.min(maxX, dragState.current.baseX + delta));
    const progress = (nextX - minX) / Math.max(1, maxX - minX);
    const w = rects.home.w + (rects.away.w - rects.home.w) * progress;
    setMeasuredThumb({ x: nextX, w });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragState.current || !rects) return;
    const mid = (rects.home.x + rects.home.w / 2 + rects.away.x + rects.away.w / 2) / 2;
    const targetX = dragState.current.moved
      ? thumbRef.current.x + thumbRef.current.w / 2
      : e.clientX - e.currentTarget.getBoundingClientRect().left;
    const next: Mode = targetX > mid ? "away" : "home";
    
    suppressClickRef.current = dragState.current.moved;
    dragState.current = null;
    setDragging(false);
    
    if (next !== mode) {
      setMode(next);
      onChange?.(next);
    }
    
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const selectMode = (next: Mode) => {
    if (suppressClickRef.current) return;
    if (next !== mode) {
      setMode(next);
      onChange?.(next);
    }
  };

  const visualActive: Mode =
    dragging && rects
      ? thumb.x + thumb.w / 2 > (rects.home.x + rects.home.w / 2 + rects.away.x + rects.away.w / 2) / 2
        ? "away"
        : "home"
      : mode;

  return (
    <div
      ref={trackRef}
      role="tablist"
      aria-label="Presence mode"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cn(
        "relative flex items-center glass rounded-full p-1 h-11 select-none touch-none bg-background/20 border border-white/10",
        className
      )}
    >
      <div
        className={cn(
          "absolute left-0 top-1/2 h-9 rounded-full bg-primary shadow-lg z-10",
          !dragging && "transition-all duration-300 ease-out"
        )}
        style={{ transform: `translate(${thumb.x}px, -50%)`, width: thumb.w }}
        aria-hidden
      />

      <button
        ref={homeRef}
        role="tab"
        aria-selected={mode === "home"}
        onClick={() => selectMode("home")}
        style={{ pointerEvents: dragging ? "none" : "auto" }}
        className={cn(
          "relative z-20 flex items-center gap-1.5 h-9 px-4 rounded-full text-sm font-medium transition-colors outline-none",
          visualActive === "home" ? "text-primary-foreground" : "text-muted-foreground"
        )}
      >
        <House className="h-4 w-4" />
        <span>Home</span>
      </button>

      <button
        ref={awayRef}
        role="tab"
        aria-selected={mode === "away"}
        onClick={() => selectMode("away")}
        style={{ pointerEvents: dragging ? "none" : "auto" }}
        className={cn(
          "relative z-20 flex items-center gap-1.5 h-9 px-4 rounded-full text-sm font-medium transition-colors outline-none",
          visualActive === "away" ? "text-primary-foreground" : "text-muted-foreground"
        )}
      >
        <Plane className="h-4 w-4" />
        <span>Away</span>
      </button>
    </div>
  );
}