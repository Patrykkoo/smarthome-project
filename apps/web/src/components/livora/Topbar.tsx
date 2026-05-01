import { Bell, Plus, Radio } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const API_URL = import.meta.env.VITE_API_URL;

export function Topbar() {
  const [home, setHome] = useState(true);
  const [isPairing, setIsPairing] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

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

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 px-4 md:px-8">
      <SidebarTrigger className="rounded-xl glass h-10 w-10" />

      <div className="hidden md:block flex-1">
        <h2 className="font-display text-lg font-semibold leading-tight">Hi, Patryk</h2>
        <p className="text-xs text-muted-foreground">
          {isPairing ? `Pairing active: ${formatTime(timeLeft)}` : "Welcome home."}
        </p>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* ZMIANA: justify-start zamiast justify-center, stały margines px-4 i minimalnie szerszy button */}
        <button
          onClick={togglePairing}
          className={cn(
            "flex items-center justify-start px-4 gap-2 py-2 rounded-full transition-all duration-500 w-[165px]",
            isPairing 
              ? "bg-orange-500 text-white animate-pulse shadow-[0_0_15px_rgba(249,115,22,0.5)]" 
              : "glass hover:bg-muted/50 text-foreground"
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

        <div className="flex items-center gap-2 glass rounded-full px-3 py-2 ml-2">
          <span className={`text-xs font-medium ${home ? "text-foreground" : "text-muted-foreground"}`}>Home</span>
          <Switch checked={!home} onCheckedChange={(v) => setHome(!v)} />
          <span className={`text-xs font-medium ${!home ? "text-foreground" : "text-muted-foreground"}`}>Away</span>
        </div>

        <button className="relative h-10 w-10 rounded-full glass flex items-center justify-center">
          <Bell className="h-4 w-4" />
          <span className="absolute top-2.5 right-2.5 h-1.5 w-1.5 rounded-full bg-accent" />
        </button>
      </div>
    </header>
  );
}