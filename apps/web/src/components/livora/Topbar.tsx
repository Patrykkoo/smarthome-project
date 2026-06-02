import { Bell, Plus, House, Plane, X, CheckCheck, Trash2, ShieldAlert, AlertTriangle, Info, Droplets, WifiOff, BatteryWarning } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useWebSockets } from "@/hooks/use-websockets";
import { useDevices } from "@/hooks/use-devices";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { auth } from "@/lib/auth";

const API_URL = import.meta.env.VITE_API_URL;

export type NotificationType = "alert" | "warning" | "info" | "leak" | "offline" | "battery" | "success";

export interface AppNotification {
  id: string;
  title: string;
  description: string;
  time: string;
  read: boolean;
  type: NotificationType;
}

const getRelativeTime = (isoString: string) => {
  const date = new Date(isoString);
  const diff = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

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

  const [rects, setRects] = useState<{ home: { x: number; w: number }; away: { x: number; w: number } } | null>(null);
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
    dragState.current = { startX: e.clientX, baseX: thumbRef.current.x || rects[mode].x, moved: false };
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
    const targetX = dragState.current.moved ? thumbRef.current.x + thumbRef.current.w / 2 : e.clientX - e.currentTarget.getBoundingClientRect().left;
    const next: Mode = targetX > mid ? "away" : "home";
    
    suppressClickRef.current = dragState.current.moved;
    dragState.current = null;
    setDragging(false);
    
    if (next !== mode) {
      setMode(next);
      onChange?.(next);
    }
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
  };

  const selectMode = (next: Mode) => {
    if (suppressClickRef.current) return;
    if (next !== mode) {
      setMode(next);
      onChange?.(next);
    }
  };

  const visualActive: Mode = dragging && rects ? thumb.x + thumb.w / 2 > (rects.home.x + rects.home.w / 2 + rects.away.x + rects.away.w / 2) / 2 ? "away" : "home" : mode;

  return (
    <div
      ref={trackRef}
      role="tablist"
      aria-label="Presence mode"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cn("relative flex items-center glass rounded-full p-1 h-11 select-none touch-none bg-background/20 border border-white/10", className)}
    >
      <div className={cn("absolute left-0 top-1/2 h-9 rounded-full bg-primary shadow-lg z-10", !dragging && "transition-all duration-300 ease-out")} style={{ transform: `translate(${thumb.x}px, -50%)`, width: thumb.w }} aria-hidden />
      <button ref={homeRef} role="tab" aria-selected={mode === "home"} onClick={() => selectMode("home")} style={{ pointerEvents: dragging ? "none" : "auto" }} className={cn("relative z-20 flex items-center gap-1.5 h-9 px-4 rounded-full text-sm font-medium transition-colors outline-none", visualActive === "home" ? "text-primary-foreground" : "text-muted-foreground")}>
        <House className="h-4 w-4" /><span>Home</span>
      </button>
      <button ref={awayRef} role="tab" aria-selected={mode === "away"} onClick={() => selectMode("away")} style={{ pointerEvents: dragging ? "none" : "auto" }} className={cn("relative z-20 flex items-center gap-1.5 h-9 px-4 rounded-full text-sm font-medium transition-colors outline-none", visualActive === "away" ? "text-primary-foreground" : "text-muted-foreground")}>
        <Plane className="h-4 w-4" /><span>Away</span>
      </button>
    </div>
  );
}

export function Topbar() {
  const { socket } = useWebSockets();
  const { data: devices = [] } = useDevices();
  const queryClient = useQueryClient();

  const [presenceMode, setPresenceMode] = useState<"home" | "away">("home");
  const presenceModeRef = useRef<"home" | "away">("home");

  const [isPairing, setIsPairing] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  
  const [userName, setUserName] = useState(auth.getCurrentUser()?.username || 'Guest');
  
  // USTAWIENIA POBIERANE Z LOCALSTORAGE
  const [homeName, setHomeName] = useState(localStorage.getItem('livora_home_name') || 'My Smart Home');
  const [sysSounds, setSysSounds] = useState(localStorage.getItem('livora_sys_sounds') !== 'false');
  const [alertOffline, setAlertOffline] = useState(localStorage.getItem('livora_alert_offline') !== 'false');
  const [alertBattery, setAlertBattery] = useState(localStorage.getItem('livora_alert_battery') !== 'false');

  useEffect(() => {
    const handleAuthChange = () => {
      setUserName(auth.getCurrentUser()?.username || 'Guest');
      setHomeName(localStorage.getItem('livora_home_name') || 'My Smart Home');
      setSysSounds(localStorage.getItem('livora_sys_sounds') !== 'false');
      setAlertOffline(localStorage.getItem('livora_alert_offline') !== 'false');
      setAlertBattery(localStorage.getItem('livora_alert_battery') !== 'false');
    };
    window.addEventListener('auth_changed', handleAuthChange);
    window.addEventListener('user_settings_changed', handleAuthChange);
    return () => {
      window.removeEventListener('auth_changed', handleAuthChange);
      window.removeEventListener('user_settings_changed', handleAuthChange);
    };
  }, []);

  const notifiedStatesRef = useRef<Set<string>>(new Set());
  const hasInitializedStates = useRef(false);
  const [activeAlarms, setActiveAlarms] = useState<Set<string>>(new Set());

  const ignoredOfflineRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    axios.get(`${API_URL}/presence`).then(res => {
        setPresenceMode(res.data.mode);
        presenceModeRef.current = res.data.mode;
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handleIgnore = (e: any) => ignoredOfflineRef.current.add(e.detail);
    window.addEventListener('ignore_offline', handleIgnore);
    return () => window.removeEventListener('ignore_offline', handleIgnore);
  }, []);

  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    const saved = localStorage.getItem('livora_notifications');
    if (saved) { 
      try { 
        const parsed = JSON.parse(saved);
        const unique = [];
        const seen = new Set();
        for (const n of parsed) {
          if (!seen.has(n.id)) {
            seen.add(n.id);
            unique.push(n);
          }
        }
        return unique;
      } catch (e) { return []; } 
    }
    return [];
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    localStorage.setItem('livora_notifications', JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    if (devices.length > 0 && !hasInitializedStates.current) {
      devices.forEach((d: any) => {
        const p = d.last_payload || {};
        if (p.water_leak === true || p.water_leak === "true") notifiedStatesRef.current.add(`${d.friendly_name}_leak`);
        if (p.tamper === true || p.tamper === "true") notifiedStatesRef.current.add(`${d.friendly_name}_tamper`);
        if (p.state === 'OFFLINE' || p.state === 'offline' || p.availability === 'offline') notifiedStatesRef.current.add(`${d.friendly_name}_offline`);
        if (p.battery !== undefined && Number(p.battery) <= 15) notifiedStatesRef.current.add(`${d.friendly_name}_battery`);
      });
      hasInitializedStates.current = true;
    }
  }, [devices]);

  const notifyAndSave = (type: NotificationType, title: string, description: string, customId?: string) => {
    const toastId = customId || `toast_${Date.now()}`;
    const listId = `notif_${Date.now()}_${Math.random()}`;
    
    setNotifications(prev => [{ id: listId, title, description, time: new Date().toISOString(), read: false, type }, ...prev]);

    let Icon = Info;
    let iconColor = "text-blue-500";

    if (type === "alert" || type === "leak") { Icon = ShieldAlert; iconColor = "text-destructive"; }
    else if (type === "warning" || type === "offline" || type === "battery") { Icon = AlertTriangle; iconColor = "text-orange-500"; }
    else if (type === "success") { Icon = CheckCheck; iconColor = "text-emerald-500"; }

    const isPersistent = type === "leak" || type === "alert";

    toast(title, {
      description,
      id: toastId,
      duration: isPersistent ? Infinity : 5000,
      icon: <Icon className={cn("h-5 w-5 mr-1", iconColor)} />
    });
  };

  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    audioCtxRef.current = ctx;

    const unlockAudio = () => { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); };
    window.addEventListener('click', unlockAudio, { capture: true });
    window.addEventListener('touchstart', unlockAudio, { capture: true });
    window.addEventListener('keydown', unlockAudio, { capture: true });

    return () => {
      window.removeEventListener('click', unlockAudio, { capture: true });
      window.removeEventListener('touchstart', unlockAudio, { capture: true });
      window.removeEventListener('keydown', unlockAudio, { capture: true });
      if (ctx.state !== 'closed') ctx.close().catch(() => {});
    };
  }, []);

  const isAlarmActive = activeAlarms.size > 0;

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isAlarmActive && sysSounds) { // ODCZYTYWANIE USTAWIEŃ DŹWIĘKU
      const playBeep = () => {
        const ctx = audioCtxRef.current;
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        if (ctx.state === 'suspended') return;
        
        try {
          const oscillator = ctx.createOscillator();
          const gainNode = ctx.createGain();
          oscillator.connect(gainNode);
          gainNode.connect(ctx.destination);
          oscillator.type = 'sawtooth';
          oscillator.frequency.setValueAtTime(800, ctx.currentTime); 
          oscillator.frequency.setValueAtTime(1000, ctx.currentTime + 0.25); 
          gainNode.gain.setValueAtTime(0, ctx.currentTime);
          gainNode.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05); 
          gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5); 
          oscillator.start(ctx.currentTime);
          oscillator.stop(ctx.currentTime + 0.55);
        } catch(e) { console.error(e) }
      };

      playBeep();
      interval = setInterval(playBeep, 1000); 
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isAlarmActive, sysSounds]);

  useEffect(() => {
    if (!socket) return;

    const handleDeviceJoined = (data: any) => {
        notifyAndSave("success", "Device Connected", `Successfully paired with ${data.friendlyName}.`);
        queryClient.invalidateQueries({ queryKey: ['devices'] });
    };

    const handleListUpdate = () => {
        queryClient.invalidateQueries({ queryKey: ['devices'] });
    };

    const handleUpdate = (data: any) => {
      const { friendlyName, payload } = data;
      let soundAlarm = false;
      let cancelAlarm = false;

      if (payload.water_leak !== undefined) {
        const isLeaking = payload.water_leak === true || payload.water_leak === "true";
        const key = `${friendlyName}_leak`;
        
        if (isLeaking && !notifiedStatesRef.current.has(key)) {
          notifiedStatesRef.current.add(key);
          soundAlarm = true;
          notifyAndSave("leak", "Water Leak Alert!", `Leak detected on ${friendlyName}.`, key);
        } else if (!isLeaking && notifiedStatesRef.current.has(key)) {
          notifiedStatesRef.current.delete(key);
          cancelAlarm = true;
          toast.dismiss(key);
        }
      }

      if (payload.tamper !== undefined) {
        const isTampered = payload.tamper === true || payload.tamper === "true";
        const key = `${friendlyName}_tamper`;
        
        if (isTampered && !notifiedStatesRef.current.has(key)) {
          notifiedStatesRef.current.add(key);
          soundAlarm = true;
          notifyAndSave("alert", "Security Alert!", `Sensor tampered: ${friendlyName}.`, key);
        } else if (!isTampered && notifiedStatesRef.current.has(key)) {
          notifiedStatesRef.current.delete(key);
          cancelAlarm = true;
          toast.dismiss(key);
        }
      }

      if (payload.contact !== undefined) {
        const isClosed = payload.contact === true || payload.contact === "true";
        const key = `${friendlyName}_intrusion`;

        if (!isClosed && presenceModeRef.current === "away" && !notifiedStatesRef.current.has(key)) {
          notifiedStatesRef.current.add(key);
          soundAlarm = true;
          notifyAndSave("alert", "Intrusion Detected!", `${friendlyName} was opened while system is armed!`, key);
        } else if (isClosed && notifiedStatesRef.current.has(key)) {
          notifiedStatesRef.current.delete(key);
          cancelAlarm = true;
        }
      }

      // ODCZYTYWANIE USTAWIEŃ OFFLINE
      const isOffline = payload.state === 'OFFLINE' || payload.state === 'offline' || payload.availability === 'offline';
      const offlineKey = `${friendlyName}_offline`;
      if (isOffline && !notifiedStatesRef.current.has(offlineKey)) {
        if (ignoredOfflineRef.current.has(friendlyName)) return; 
        notifiedStatesRef.current.add(offlineKey);
        
        if (alertOffline) {
          notifyAndSave("offline", "Device Offline", `${friendlyName} lost connection to the network.`, offlineKey);
        }
      } else if (!isOffline && (payload.state || payload.availability) && notifiedStatesRef.current.has(offlineKey)) {
        notifiedStatesRef.current.delete(offlineKey);
        toast.dismiss(offlineKey);
      }

      // ODCZYTYWANIE USTAWIEŃ BATERII
      if (payload.battery !== undefined) {
        const bat = Number(payload.battery);
        const batKey = `${friendlyName}_battery`;
        if (bat <= 15 && !notifiedStatesRef.current.has(batKey)) {
          notifiedStatesRef.current.add(batKey);
          
          if (alertBattery) {
            notifyAndSave("battery", "Low Battery", `${friendlyName} battery is at ${bat}%. Replace soon.`, batKey);
          }
        } else if (bat > 15 && notifiedStatesRef.current.has(batKey)) {
          notifiedStatesRef.current.delete(batKey);
          toast.dismiss(batKey);
        }
      }

      if (soundAlarm) setActiveAlarms(prev => new Set(prev).add(friendlyName));
      else if (cancelAlarm) setActiveAlarms(prev => {
        const next = new Set(prev);
        next.delete(friendlyName);
        return next;
      });
    };

    socket.on('device_state_update', handleUpdate);
    socket.on('device_joined', handleDeviceJoined);
    socket.on('device_list_updated', handleListUpdate);

    return () => { 
      socket.off('device_state_update', handleUpdate); 
      socket.off('device_joined', handleDeviceJoined);
      socket.off('device_list_updated', handleListUpdate);
    };
  }, [socket, queryClient, alertBattery, alertOffline]); // Wpięte zależności ustawień

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
        notifyAndSave("info", "Pairing Mode Active", "Zigbee network is open to new devices for 3 minutes.", "pairing_mode");
      } else {
        setTimeLeft(0);
        notifyAndSave("info", "Pairing Mode Closed", "Zigbee network is now secured.", "pairing_mode");
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

  const handlePresenceChange = async (mode: "home" | "away") => {
    setPresenceMode(mode);
    presenceModeRef.current = mode;
    try {
        await axios.post(`${API_URL}/presence`, { mode });
    } catch(e) {}
    notifyAndSave(
      "info", 
      mode === "away" ? "System Armed" : "System Disarmed", 
      mode === "away" ? "Presence mode set to Away. Security active." : "Presence mode set to Home."
    );
  };

  const markAllAsRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  const clearAllNotifications = () => setNotifications([]);
  const markAsRead = (id: string) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 px-4 md:px-8">
        <SidebarTrigger className="rounded-xl glass h-11 w-11" />

        <div className="hidden md:block flex-1">
          <h2 className="font-display text-lg font-semibold leading-tight">Hi, {userName}</h2>
          <p className="text-xs text-muted-foreground">
            {/* WSTAWIONA NAZWA DOMU */}
            {isPairing ? `Pairing active: ${formatTime(timeLeft)}` : `Welcome to ${homeName}.`}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={togglePairing}
            className={cn(
              "flex items-center justify-between px-3 h-11 rounded-full transition-all duration-300 w-fit min-w-[150px]",
              isPairing 
                ? "bg-primary text-primary-foreground shadow-md" 
                : "glass text-foreground hover:bg-background/60"
            )}
          >
            {isPairing ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-sm font-medium pl-1">Searching</span>
                </div>
                <span className="text-xs font-bold bg-background/20 text-primary-foreground px-2 py-0.5 rounded-md tabular-nums ml-3">
                  {formatTime(timeLeft)}
                </span>
              </>
            ) : (
              <div className="flex items-center gap-2 mx-auto">
                <Plus className="h-4 w-4 shrink-0" />
                <span className="text-sm font-medium text-muted-foreground">Pairing Mode</span>
              </div>
            )}
          </button>

          <PresenceToggle 
            initialMode={presenceMode}
            onChange={handlePresenceChange}
            className="hidden sm:flex" 
          />

          <button 
            onClick={() => setIsNotificationsOpen(true)}
            className="relative h-11 w-11 rounded-full glass flex items-center justify-center transition-transform active:scale-95 focus-visible:ring-0 outline-none"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute top-3 right-3 h-1.5 w-1.5 rounded-full bg-destructive shadow-[0_0_8px_rgba(229,72,77,0.8)]" />
            )}
          </button>
        </div>
      </header>

      {/* PRAWY PANEL POWIADOMIEŃ */}
      <div 
        className={cn("fixed inset-0 z-40 bg-background/60 backdrop-blur-sm transition-opacity duration-500", isNotificationsOpen ? "opacity-100" : "opacity-0 pointer-events-none")}
        onClick={() => setIsNotificationsOpen(false)}
      />

      <div 
        className={cn("fixed top-0 right-0 z-50 h-full w-full sm:w-[400px] glass border-l border-white/10 shadow-2xl transition-transform duration-500 ease-out flex flex-col", isNotificationsOpen ? "translate-x-0" : "translate-x-full")}
      >
        <div className="flex items-center justify-between p-6 pb-4">
          <div>
            <h2 className="font-display text-2xl font-semibold">Notifications</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {unreadCount > 0 ? `You have ${unreadCount} unread messages` : "You're all caught up."}
            </p>
          </div>
          <button onClick={() => setIsNotificationsOpen(false)} className="h-11 w-11 rounded-full glass flex items-center justify-center active:scale-95 transition-transform focus-visible:ring-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        {notifications.length > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
            <button onClick={markAllAsRead} disabled={unreadCount === 0} className="text-sm font-medium flex items-center gap-2 text-muted-foreground active:text-foreground transition-colors disabled:opacity-50 focus-visible:ring-0">
              <CheckCheck className="h-4 w-4" /> Mark all as read
            </button>
            <button onClick={clearAllNotifications} className="text-sm font-medium flex items-center gap-2 text-destructive active:text-destructive/80 transition-colors focus-visible:ring-0">
              <Trash2 className="h-4 w-4" /> Clear all
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
          {notifications.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-50 py-20">
              <Bell className="h-12 w-12 mb-4" />
              <p className="text-lg font-medium text-foreground">No notifications</p>
              <p className="text-sm text-muted-foreground mt-1">When system alerts happen, they'll appear here.</p>
            </div>
          ) : (
            notifications.map((n) => {
              let Icon = Info;
              let iconColor = "text-blue-500";
              let iconBg = "bg-blue-500/10";

              if (n.type === "alert") { Icon = ShieldAlert; iconColor = "text-destructive"; iconBg = "bg-destructive/10"; }
              else if (n.type === "leak") { Icon = Droplets; iconColor = "text-destructive"; iconBg = "bg-destructive/10"; }
              else if (n.type === "warning" || n.type === "offline") { Icon = n.type === "offline" ? WifiOff : AlertTriangle; iconColor = "text-orange-500"; iconBg = "bg-orange-500/10"; }
              else if (n.type === "battery") { Icon = BatteryWarning; iconColor = "text-orange-500"; iconBg = "bg-orange-500/10"; }
              else if (n.type === "success") { Icon = CheckCheck; iconColor = "text-emerald-500"; iconBg = "bg-emerald-500/10"; }

              return (
                <div 
                  key={n.id}
                  onClick={() => markAsRead(n.id)}
                  className={cn("relative p-4 rounded-2xl transition-colors border cursor-pointer", !n.read ? "bg-background/60 border-border/60 shadow-sm" : "bg-transparent border-transparent opacity-75")}
                >
                  {!n.read && <span className="absolute top-5 right-5 h-2 w-2 rounded-full bg-accent" />}
                  <div className="flex gap-4">
                    <div className={cn("h-10 w-10 shrink-0 rounded-full flex items-center justify-center", iconBg, iconColor)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="pr-4">
                      <p className={cn("text-sm font-semibold", !n.read ? "text-foreground" : "text-foreground/80")}>{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{n.description}</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mt-2">{getRelativeTime(n.time)}</p>
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