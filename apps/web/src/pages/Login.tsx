import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "@/lib/auth";
import { GlassCard } from "@/components/livora/GlassCard";
import { Home, Delete } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Login() {
  const [pin, setPin] = useState("");
  const navigate = useNavigate();

  const handleKeyPress = async (digit: number) => {
    if (pin.length < 6) {
      const newPin = pin + digit.toString();
      setPin(newPin);
      
      if (newPin.length === 6) {
        try {
          const user = await auth.kioskLogin(newPin);
          toast.success(`Welcome to Smartify, ${user.username}!`);
          navigate("/");
        } catch (error) {
          toast.error("Incorrect PIN");
          setPin("");
        }
      }
    }
  };

  const handleDelete = () => setPin(p => p.slice(0, -1));

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden select-none">
      {/* GLOW Z DWÓCH STRON */}
      <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] max-w-[600px] max-h-[600px] bg-primary/20 rounded-full blur-[120px] pointer-events-none opacity-60" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] max-w-[600px] max-h-[600px] bg-primary/20 rounded-full blur-[120px] pointer-events-none opacity-60" />
      
      <GlassCard className="w-full max-w-sm p-8 relative z-10 animate-in fade-in zoom-in duration-500">
        <div className="flex flex-col items-center mb-10">
          <div className="h-16 w-16 bg-primary rounded-3xl flex items-center justify-center text-primary-foreground shadow-lg mb-4">
            <Home className="h-8 w-8" />
          </div>
          <h1 className="font-display text-2xl font-semibold text-center leading-tight">Home Security</h1>
          <p className="text-muted-foreground mt-1 text-sm">Enter 6-digit PIN to unlock</p>
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
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
            <button 
              key={n} 
              onClick={() => handleKeyPress(n)} 
              className="h-16 rounded-full bg-background/60 hover:bg-background border border-white/5 text-2xl font-display font-semibold active:scale-95 transition-transform focus-visible:ring-0 outline-none shadow-sm"
            >
              {n}
            </button>
          ))}
          <button 
            onClick={() => setPin('')} 
            className="h-16 rounded-full text-muted-foreground font-semibold hover:bg-background/40 active:scale-95 transition-transform outline-none focus-visible:ring-0 uppercase text-sm tracking-wider"
          >
            Clear
          </button>
          <button 
            onClick={() => handleKeyPress(0)} 
            className="h-16 rounded-full bg-background/60 hover:bg-background border border-white/5 text-2xl font-display font-semibold active:scale-95 transition-transform outline-none focus-visible:ring-0 shadow-sm"
          >
            0
          </button>
          <button 
            onClick={handleDelete} 
            className="h-16 rounded-full text-muted-foreground flex items-center justify-center hover:bg-background/40 active:scale-95 transition-transform outline-none focus-visible:ring-0"
          >
            <Delete className="h-6 w-6"/>
          </button>
        </div>
      </GlassCard>
    </div>
  );
}