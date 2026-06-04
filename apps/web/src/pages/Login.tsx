import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "@/lib/auth";
import { PinPad } from "@/components/smartify/PinPad";
import { Home } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const [pin, setPin] = useState("");
  const navigate = useNavigate();

  const handleKeyPress = async (digit: number) => {
    if (pin.length >= 6) return;
    const newPin = pin + digit.toString();
    setPin(newPin);

    if (newPin.length === 6) {
      try {
        await auth.kioskLogin(newPin);
        navigate("/");
      } catch (error: any) {
        if (error.message === "Network Error" || error.code === "ERR_NETWORK") {
          toast.error("Network Error", { description: "Cannot connect to the local API. Check browser security settings or IP." });
        } else if (error.response?.status === 401) {
          toast.error("Incorrect PIN");
        } else {
          toast.error("Login failed", { description: error.response?.data?.error || error.message });
        }
        setPin("");
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background select-none">
      <PinPad
        icon={Home}
        title="Home Security"
        subtitle="Enter 6-digit PIN to unlock"
        pin={pin}
        secondaryLabel="Clear"
        onSecondary={() => setPin("")}
        onDigit={handleKeyPress}
        onBackspace={() => setPin((p) => p.slice(0, -1))}
      />
    </div>
  );
}
