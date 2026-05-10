import { Bell, Plus, Radio, House, Plane, X, CheckCheck, Trash2, ShieldAlert, AlertTriangle, Info, Droplets } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const API_URL = import.meta.env.VITE_API_URL;

// ==========================================
// TYPY DLA POWIADOMIEŃ
// ==========================================
export type NotificationType = "alert" | "warning" | "info" | "leak";

export interface AppNotification {
  id: string;
  title: string;
  description: string;
  time: Date;
  read: boolean;
  type: NotificationType;
}

// Funkcja pomocnicza do formatowania czasu (np. "5m ago")
const getRelativeTime = (date: Date) => {
  const diff = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

// ==========================================
// KOMPONENT: PRESENCE TOGGLE
// ==========================================
type Mode = "home" | "away";

interface PresenceToggleProps {
  initialMode?: Mode;
  onChange?: (mode: Mode) => void;
  className?: string;
}

function PresenceToggle({ initialMode = "home", onChange, className }: PresenceToggleProps) {
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

// ==========================================
// GŁÓWNY KOMPONENT: TOPBAR
// ==========================================
export function Topbar() {
  const [presenceMode, setPresenceMode] = useState<"home" | "away">("home");
  const [isPairing, setIsPairing] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  
  // Stan dla panelu powiadomień
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  
  // Przykładowe powiadomienia (MOCK DATA)
  const [notifications, setNotifications] = useState<AppNotification[]>([
    {
      id: "1",
      title: "Water Leak Alert!",
      description: "Leak detected under the Kitchen Sink.",
      time: new Date(Date.now() - 1000 * 60 * 5), // 5 min temu
      read: false,
      type: "leak"
    },
    {
      id: "2",
      title: "Tamper Alert",
      description: "Front Door sensor has been tampered with.",
      time: new Date(Date.now() - 1000 * 60 * 45), // 45 min temu
      read: false,
      type: "alert"
    },
    {
      id: "3",
      title: "Device Offline",
      description: "Living Room Lamp lost connection to the network.",
      time: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 godziny temu
      read: true,
      type: "warning"
    },
    {
      id: "4",
      title: "System Armed",
      description: "Presence mode set to Away. Security systems are active.",
      time: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 dzień temu
      read: true,
      type: "info"
    }
  ]);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Nasłuchiwanie na nowe powiadomienia wysyłane z innych plików
  useEffect(() => {
    const handleNewNotification = (e: CustomEvent<AppNotification>) => {
      setNotifications(prev => [e.detail, ...prev]);
    };
    window.addEventListener('new_app_notification', handleNewNotification as EventListener);
    return () => window.removeEventListener('new_app_notification', handleNewNotification as EventListener);
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPairing && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (timeLeft === 0) {
      setIsPairing(false);
    }
    return () => clearInterval(timer);
  }, [isPairing, timeLeft]);

  const togglePairing = async () => {
    const newState = !isPairing;
    try {
      await axios.post(`${API_URL}/bridge/permit_join`, { permit: newState });
      setIsPairing(newState);
      
      if (newState) {
        setTimeLeft(180);
        toast.info("Pairing mode activated", {
          description: "Your Zigbee network is now open for new devices.",
          duration: 5000,
        });
      } else {
        setTimeLeft(0);
        toast.info("Pairing mode deactivated", {
          description: "Your network is closed."
        });
      }
    } catch (error) {
      toast.error("Network error", { description: "Failed to change pairing mode." });
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handlePresenceChange = (mode: "home" | "away") => {
    setPresenceMode(mode);
    
    // Opcjonalnie: dodaj powiadomienie do historii po zmianie trybu
    const newNotif: AppNotification = {
      id: Date.now().toString(),
      title: mode === "away" ? "System Armed" : "System Disarmed",
      description: mode === "away" ? "Presence mode set to Away." : "Presence mode set to Home.",
      time: new Date(),
      read: false,
      type: "info"
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  // Akcje panelu powiadomień
  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 px-4 md:px-8">
        <SidebarTrigger className="rounded-xl glass h-11 w-11" />

        <div className="hidden md:block flex-1">
          <h2 className="font-display text-lg font-semibold leading-tight">Hi, Patryk</h2>
          <p className="text-xs text-muted-foreground">
            {isPairing ? `Pairing active: ${formatTime(timeLeft)}` : "Welcome home."}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={togglePairing}
            className={cn(
              "flex items-center justify-start px-4 gap-2 h-11 rounded-full transition-all duration-500 w-[165px]",
              isPairing 
                ? "bg-orange-500 text-white animate-pulse shadow-[0_0_15px_rgba(249,115,22,0.5)]" 
                : "glass text-foreground"
            )}
          >
            {isPairing ? (
              <>
                <Radio className="h-4 w-4 shrink-0" />
                <span className="text-sm font-medium tabular-nums">Pairing... ({formatTime(timeLeft)})</span>
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 shrink-0" />
                <span className="text-sm font-medium text-muted-foreground">Connect Device</span>
              </>
            )}
          </button>

          <PresenceToggle 
            initialMode={presenceMode}
            onChange={handlePresenceChange}
            className="hidden sm:flex" 
          />

          <button 
            onClick={() => setIsNotificationsOpen(true)}
            className="relative h-11 w-11 rounded-full glass flex items-center justify-center transition-transform active:scale-95"
          >
            <Bell className="h-4 w-4" />
            {/* Kropka wyświetla się tylko, gdy są nieprzeczytane powiadomienia */}
            {unreadCount > 0 && (
              <span className="absolute top-3 right-3 h-1.5 w-1.5 rounded-full bg-destructive shadow-[0_0_8px_rgba(229,72,77,0.8)]" />
            )}
          </button>
        </div>
      </header>

      {/* ========================================== */}
      {/* PRAWY PANEL POWIADOMIEŃ (DRAWER) */}
      {/* ========================================== */}
      
      {/* Overlay - przyciemnia tło i pozwala zamknąć kliknięciem w puste miejsce */}
      <div 
        className={cn(
          "fixed inset-0 z-40 bg-background/60 backdrop-blur-sm transition-opacity duration-500",
          isNotificationsOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setIsNotificationsOpen(false)}
      />

      {/* Właściwy panel */}
      <div 
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-full sm:w-[400px] glass border-l border-white/10 shadow-2xl transition-transform duration-500 ease-out flex flex-col",
          isNotificationsOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Nagłówek panelu */}
        <div className="flex items-center justify-between p-6 pb-4">
          <div>
            <h2 className="font-display text-2xl font-semibold">Notifications</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {unreadCount > 0 ? `You have ${unreadCount} unread messages` : "You're all caught up."}
            </p>
          </div>
          <button 
            onClick={() => setIsNotificationsOpen(false)} 
            className="h-11 w-11 rounded-full glass flex items-center justify-center active:scale-95 transition-transform"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Pasek akcji */}
        {notifications.length > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
            <button 
              onClick={markAllAsRead} 
              disabled={unreadCount === 0}
              className="text-sm font-medium flex items-center gap-2 text-muted-foreground active:text-foreground transition-colors disabled:opacity-50"
            >
              <CheckCheck className="h-4 w-4" /> Mark all as read
            </button>
            <button 
              onClick={clearAllNotifications} 
              className="text-sm font-medium flex items-center gap-2 text-destructive active:text-destructive/80 transition-colors"
            >
              <Trash2 className="h-4 w-4" /> Clear all
            </button>
          </div>
        )}

        {/* Lista powiadomień */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
          {notifications.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-50 py-20">
              <Bell className="h-12 w-12 mb-4" />
              <p className="text-lg font-medium text-foreground">No notifications</p>
              <p className="text-sm text-muted-foreground mt-1">When system alerts happen, they'll appear here.</p>
            </div>
          ) : (
            notifications.map((n) => {
              // Ustalanie ikony i koloru na podstawie typu
              let Icon = Info;
              let iconColor = "text-blue-500";
              let iconBg = "bg-blue-500/10";

              if (n.type === "alert") {
                Icon = ShieldAlert;
                iconColor = "text-destructive";
                iconBg = "bg-destructive/10";
              } else if (n.type === "leak") {
                Icon = Droplets;
                iconColor = "text-destructive";
                iconBg = "bg-destructive/10";
              } else if (n.type === "warning") {
                Icon = AlertTriangle;
                iconColor = "text-orange-500";
                iconBg = "bg-orange-500/10";
              }

              return (
                <div 
                  key={n.id}
                  onClick={() => markAsRead(n.id)}
                  className={cn(
                    "relative p-4 rounded-2xl transition-colors border",
                    !n.read 
                      ? "bg-background/60 border-border/60 shadow-sm" // Wyraźne dla nieprzeczytanych
                      : "bg-transparent border-transparent opacity-75" // Zlewające się dla przeczytanych
                  )}
                >
                  {/* Kropka nieprzeczytanego */}
                  {!n.read && (
                    <span className="absolute top-5 right-5 h-2 w-2 rounded-full bg-accent" />
                  )}
                  
                  <div className="flex gap-4">
                    <div className={cn("h-10 w-10 shrink-0 rounded-full flex items-center justify-center", iconBg, iconColor)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="pr-4">
                      <p className={cn("text-sm font-semibold", !n.read ? "text-foreground" : "text-foreground/80")}>
                        {n.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {n.description}
                      </p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mt-2">
                        {getRelativeTime(n.time)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}