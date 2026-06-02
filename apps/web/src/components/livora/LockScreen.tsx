import { useState, useEffect } from "react";
import { useWebSockets } from "@/hooks/use-websockets";
import { auth } from "@/lib/auth";
import axios from "axios";
import { Lock, Delete } from "lucide-react";
import { cn } from "@/lib/utils";

const API_URL = import.meta.env.VITE_API_URL;

export function LockScreen() {
  const { socket } = useWebSockets();
  const [isLocked, setIsLocked] = useState(false);
  const [showPad, setShowPad] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    axios.get(`${API_URL}/presence`).then(res => {
      if (res.data.mode === 'away') setIsLocked(true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handlePresence = (data: any) => {
      if (data.mode === 'away') {
         setIsLocked(true);
         setShowPad(false);
         setPin("");
      } else {
         setIsLocked(false);
      }
    };
    socket.on('presence_update', handlePresence);
    return () => { socket.off('presence_update', handlePresence); };
  }, [socket]);

  const handleKeyPress = (digit: number) => {
    setError(false);
    if (pin.length < 6) {
      const newPin = pin + digit.toString();
      setPin(newPin);
      if (newPin.length === 6) verify(newPin);
    }
  };

  const verify = async (testPin: string) => {
    const valid = await auth.verifyPin(testPin);
    if (valid) {
      await axios.post(`${API_URL}/presence`, { mode: 'home' });
      setIsLocked(false);
      setPin("");
      setShowPad(false);
    } else {
      setError(true);
      setTimeout(() => setPin(""), 500); 
    }
  };

  if (!isLocked) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] bg-background text-foreground flex items-center justify-center transition-opacity duration-1000 overflow-hidden select-none"
      onClick={() => !showPad && setShowPad(true)}
    >
      {/* GLOW Z DWÓCH STRON - Dokładnie taki sam jak w menu i na ekranie logowania */}
      <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] max-w-[600px] max-h-[600px] bg-primary/20 rounded-full blur-[120px] pointer-events-none opacity-60" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] max-w-[600px] max-h-[600px] bg-primary/20 rounded-full blur-[120px] pointer-events-none opacity-60" />

      {!showPad ? (
         <div className="flex flex-col items-center opacity-70 animate-pulse cursor-pointer relative z-10">
           <Lock className="h-8 w-8 mb-4" />
           <p className="text-sm uppercase tracking-widest font-semibold">System Armed</p>
           <p className="text-xs text-muted-foreground mt-2">Tap to unlock</p>
         </div>
      ) : (
        <div className="animate-in fade-in zoom-in duration-300 w-full max-w-sm p-6 relative z-10" onClick={e => e.stopPropagation()}>
           <div className="flex flex-col items-center mb-10">
             <div className="h-16 w-16 rounded-3xl bg-primary/20 flex items-center justify-center mb-4 border border-primary/30">
               <Lock className="h-7 w-7 text-primary" />
             </div>
             <h2 className="text-2xl font-display font-semibold">Enter PIN</h2>
             <p className={cn("text-sm mt-1 transition-colors", error ? "text-destructive font-medium" : "text-muted-foreground")}>
               {error ? "Incorrect PIN" : "To disarm system"}
             </p>
           </div>
           
           <div className="flex justify-center gap-4 mb-10 h-4">
             {[...Array(6)].map((_, i) => (
               <div 
                  key={i} 
                  className={cn(
                    "w-3.5 h-3.5 rounded-full transition-all duration-300", 
                    i < pin.length 
                      ? "bg-primary scale-110 shadow-[0_0_12px_rgba(var(--primary),0.6)]" 
                      : "bg-muted border border-border/50"
                  )} 
               />
             ))}
           </div>

           <div className="grid grid-cols-3 gap-4 max-w-[280px] mx-auto">
             {[1,2,3,4,5,6,7,8,9].map(n => (
               <button 
                 key={n} 
                 onClick={() => handleKeyPress(n)} 
                 className="h-16 rounded-full bg-background/60 hover:bg-background border border-white/5 text-2xl font-display font-semibold active:scale-95 transition-transform focus-visible:ring-0 outline-none shadow-sm"
               >
                 {n}
               </button>
             ))}
             <button 
               onClick={() => setShowPad(false)} 
               className="h-16 rounded-full text-muted-foreground font-semibold hover:bg-background/40 active:scale-95 transition-transform outline-none focus-visible:ring-0 uppercase text-sm tracking-wider"
             >
               Cancel
             </button>
             <button 
               onClick={() => handleKeyPress(0)} 
               className="h-16 rounded-full bg-background/60 hover:bg-background border border-white/5 text-2xl font-display font-semibold active:scale-95 transition-transform outline-none focus-visible:ring-0 shadow-sm"
             >
               0
             </button>
             <button 
               onClick={() => setPin(p => p.slice(0,-1))} 
               className="h-16 rounded-full text-muted-foreground flex items-center justify-center hover:bg-background/40 active:scale-95 transition-transform outline-none focus-visible:ring-0"
             >
               <Delete className="h-6 w-6"/>
             </button>
           </div>
        </div>
      )}
    </div>
  );
}