import { useState, useEffect } from "react";
import { useWebSockets } from "@/hooks/use-websockets";
import { auth } from "@/lib/auth";
import axios from "axios";
import { Lock } from "lucide-react";
import { PinPad } from "@/components/smartify/PinPad";

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
    if (pin.length >= 6) return;
    const newPin = pin + digit.toString();
    setPin(newPin);
    if (newPin.length === 6) verify(newPin);
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
      className="fixed inset-0 z-[100] bg-background text-foreground flex items-center justify-center transition-opacity duration-1000 select-none"
      onClick={() => !showPad && setShowPad(true)}
    >
      {!showPad ? (
        <div className="flex flex-col items-center opacity-70 animate-pulse cursor-pointer relative z-10">
          <Lock className="h-8 w-8 mb-4" />
          <p className="text-sm uppercase tracking-widest font-semibold">System Armed</p>
          <p className="text-xs text-muted-foreground mt-2">Tap to unlock</p>
        </div>
      ) : (
        <PinPad
          icon={Lock}
          title="Enter PIN"
          subtitle={error ? "Incorrect PIN" : "To disarm system"}
          error={error}
          pin={pin}
          secondaryLabel="Cancel"
          onSecondary={() => { setShowPad(false); setPin(""); setError(false); }}
          onDigit={handleKeyPress}
          onBackspace={() => setPin((p) => p.slice(0, -1))}
        />
      )}
    </div>
  );
}
