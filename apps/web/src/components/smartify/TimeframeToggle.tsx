import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type TimeframeMode = "week" | "month" | "year";

interface TimeframeToggleProps {
  initialMode?: TimeframeMode;
  onChange?: (mode: TimeframeMode) => void;
  className?: string;
}

export function TimeframeToggle({ initialMode = "week", onChange, className }: TimeframeToggleProps) {
  const [mode, setMode] = useState<TimeframeMode>(initialMode);
  
  const trackRef = useRef<HTMLDivElement>(null);
  const weekRef = useRef<HTMLButtonElement>(null);
  const monthRef = useRef<HTMLButtonElement>(null);
  const yearRef = useRef<HTMLButtonElement>(null);

  const [rects, setRects] = useState<Record<TimeframeMode, { x: number; w: number }> | null>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number }>({ x: 4, w: 0 });
  const [dragging, setDragging] = useState(false);
  
  const [hasInteracted, setHasInteracted] = useState(false);
  
  const thumbRef = useRef(thumb);
  const suppressClickRef = useRef(false);
  const dragState = useRef<{ startX: number; baseX: number; moved: boolean } | null>(null);

  const setMeasuredThumb = (next: { x: number; w: number }) => {
    thumbRef.current = next;
    setThumb(next);
  };

  useLayoutEffect(() => {
    const measure = () => {
      if (!trackRef.current || !weekRef.current || !monthRef.current || !yearRef.current) return;
      const tRect = trackRef.current.getBoundingClientRect();
      setRects({
        week: { x: weekRef.current.getBoundingClientRect().left - tRect.left, w: weekRef.current.getBoundingClientRect().width },
        month: { x: monthRef.current.getBoundingClientRect().left - tRect.left, w: monthRef.current.getBoundingClientRect().width },
        year: { x: yearRef.current.getBoundingClientRect().left - tRect.left, w: yearRef.current.getBoundingClientRect().width },
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
    setHasInteracted(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, baseX: thumbRef.current.x || rects[mode].x, moved: false };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current || !rects) return;
    const delta = e.clientX - dragState.current.startX;
    if (Math.abs(delta) > 3) dragState.current.moved = true;
    
    const minX = rects.week.x;
    const maxX = rects.year.x;
    const nextX = Math.max(minX, Math.min(maxX, dragState.current.baseX + delta));
    
    let w = rects.week.w;
    if (nextX > rects.week.x && nextX < rects.month.x) {
      const p = (nextX - rects.week.x) / (rects.month.x - rects.week.x);
      w = rects.week.w + (rects.month.w - rects.week.w) * p;
    } else if (nextX >= rects.month.x) {
      const p = (nextX - rects.month.x) / (rects.year.x - rects.month.x);
      w = rects.month.w + (rects.year.w - rects.month.w) * p;
    }
    
    setMeasuredThumb({ x: nextX, w });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragState.current || !rects) return;
    
    const targetX = dragState.current.moved ? thumbRef.current.x + thumbRef.current.w / 2 : e.clientX - e.currentTarget.getBoundingClientRect().left;
    const mid1 = (rects.week.x + rects.week.w / 2 + rects.month.x + rects.month.w / 2) / 2;
    const mid2 = (rects.month.x + rects.month.w / 2 + rects.year.x + rects.year.w / 2) / 2;
    
    let next: TimeframeMode = "week";
    if (targetX > mid2) next = "year";
    else if (targetX > mid1) next = "month";
    
    suppressClickRef.current = dragState.current.moved;
    dragState.current = null;
    setDragging(false);
    
    if (next !== mode) {
      setMode(next);
      onChange?.(next);
    }
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
  };

  const selectMode = (next: TimeframeMode) => {
    if (suppressClickRef.current) return;
    setHasInteracted(true);
    if (next !== mode) {
      setMode(next);
      onChange?.(next);
    }
  };

  return (
    <div
      ref={trackRef}
      role="tablist"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cn("relative flex items-center glass rounded-full p-1 h-11 select-none touch-none bg-background/20 border border-white/10", className)}
    >
      <div 
        className={cn(
          "absolute left-0 top-1/2 h-9 rounded-full bg-primary shadow-lg z-10", 
          !dragging && hasInteracted && "transition-all duration-300 ease-out"
        )} 
        style={{ 
          transform: `translate(${thumb.x}px, -50%)`, 
          width: thumb.w || 80
        }} 
        aria-hidden 
      />
      
      <button ref={weekRef} role="tab" aria-selected={mode === "week"} onClick={() => selectMode("week")} style={{ pointerEvents: dragging ? "none" : "auto" }} className={cn("relative z-20 flex items-center justify-center h-9 px-5 rounded-full text-sm font-medium transition-colors outline-none", mode === "week" ? "text-primary-foreground" : "text-muted-foreground")}>
        This week
      </button>
      <button ref={monthRef} role="tab" aria-selected={mode === "month"} onClick={() => selectMode("month")} style={{ pointerEvents: dragging ? "none" : "auto" }} className={cn("relative z-20 flex items-center justify-center h-9 px-5 rounded-full text-sm font-medium transition-colors outline-none", mode === "month" ? "text-primary-foreground" : "text-muted-foreground")}>
        This month
      </button>
      <button ref={yearRef} role="tab" aria-selected={mode === "year"} onClick={() => selectMode("year")} style={{ pointerEvents: dragging ? "none" : "auto" }} className={cn("relative z-20 flex items-center justify-center h-9 px-5 rounded-full text-sm font-medium transition-colors outline-none", mode === "year" ? "text-primary-foreground" : "text-muted-foreground")}>
        This year
      </button>
    </div>
  );
}