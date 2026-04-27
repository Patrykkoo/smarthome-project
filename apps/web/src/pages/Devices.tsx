import { useState, useEffect } from "react";
import { Lightbulb, LayoutGrid } from "lucide-react";
import { GlassCard } from "@/components/livora/GlassCard";
import { DeviceTile } from "@/components/livora/DeviceTile";
import { cn } from "@/lib/utils";
import { useDevices } from "@/hooks/use-devices";
import { useWebSockets } from "@/hooks/use-websockets";
import axios from "axios";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const API_URL = 'http://192.168.0.66:3000/api';

const Devices = () => {
  const { data: devices = [], isLoading } = useDevices();
  const { socket } = useWebSockets();
  const queryClient = useQueryClient();
  
  const [activeRoom, setActiveRoom] = useState("All");
  const [localLiveData, setLocalLiveData] = useState<Record<string, any>>({});
  const [deviceToRename, setDeviceToRename] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [deviceToDelete, setDeviceToDelete] = useState<string | null>(null);

  // 1. Obsługa WebSockets (Live Updates + Auto-refresh listy)
  useEffect(() => {
    if (!socket) return;

    socket.on('device_state_update', (data: any) => {
      setLocalLiveData(prev => ({
        ...prev,
        [data.friendlyName]: data.payload
      }));
    });

    socket.on('device_list_updated', () => {
      console.log("🔄 Wykryto zmiany w urządzeniach, odświeżam...");
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    });

    return () => { 
      socket.off('device_state_update'); 
      socket.off('device_list_updated');
    };
  }, [socket, queryClient]);

  // 2. Inicjalizacja danych z bazy
  useEffect(() => {
    if (devices.length > 0) {
      const initialData: Record<string, any> = {};
      devices.forEach(d => {
        if (d.last_payload) initialData[d.friendly_name] = d.last_payload;
      });
      setLocalLiveData(prev => ({ ...initialData, ...prev }));
    }
  }, [devices]);

  const handleToggle = async (friendlyName: string) => {
    try {
      await axios.post(`${API_URL}/devices/${friendlyName}/set`, {
        state: 'TOGGLE'
      });
    } catch (error) {
      toast.error(`Błąd sterowania: ${friendlyName}`);
    }
  };

  const handleDelete = async (friendlyName: string) => {
    try {
      await axios.delete(`${API_URL}/devices/${friendlyName}`);
      toast.success("Urządzenie zostało usunięte");
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    } catch (error) {
      toast.error("Nie udało się usunąć urządzenia");
    }
  };

  const handleRename = async (oldName: string, updatedName: string) => {
    if (oldName === updatedName || !updatedName.trim()) return;
    try {
      await axios.put(`${API_URL}/devices/${oldName}/rename`, { new_name: updatedName.trim() });
      toast.success("Zmieniono nazwę urządzenia");
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    } catch (error) {
      toast.error("Nie udało się zmienić nazwy urządzenia");
    }
  };

  const rooms = [
    { name: "All", count: devices.length },
    { name: "Living room", count: 0 },
    { name: "Kitchen", count: 0 },
    { name: "Bedroom", count: 0 },
  ];

  const filteredDevices = activeRoom === "All" ? devices : [];

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="font-display text-3xl font-semibold">Devices & Rooms</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage every connected device room by room.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_360px] gap-6">
        {/* Rooms list */}
        <GlassCard className="p-3 h-fit">
          <ul className="space-y-1">
            {rooms.map((r) => (
              <li key={r.name}>
                <button
                  onClick={() => setActiveRoom(r.name)}
                  className={cn(
                    "w-full flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition-colors",
                    r.name === activeRoom
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                      : "text-foreground/70 hover:text-foreground hover:bg-muted/60",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {r.name === "All" && <LayoutGrid className="h-4 w-4" />}
                    <span>{r.name}</span>
                  </div>
                  <span className="text-xs opacity-70">{r.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </GlassCard>

        {/* Devices grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 content-start">
          {isLoading ? (
            <p className="col-span-2 text-center py-10 text-muted-foreground">Loading devices...</p>
          ) : filteredDevices.length === 0 ? (
            <p className="col-span-2 text-center py-10 text-muted-foreground">No devices found.</p>
          ) : (
            filteredDevices.map((d) => {
              const currentData = localLiveData[d.friendly_name] || {};
              return (
                <DeviceTile
                  key={d.id}
                  icon={Lightbulb}
                  name={d.friendly_name}
                  room={activeRoom}
                  value={currentData.state || "OFF"}
                  enabled={currentData.state === "ON"}
                  onToggle={() => handleToggle(d.friendly_name)}
                  onDelete={() => setDeviceToDelete(d.friendly_name)}
                  onRename={() => {
                    setDeviceToRename(d.friendly_name);
                    setNewName(d.friendly_name);
                  }}
                />
              );
            })
          )}
        </div>

        {/* Detail panel */}
        <GlassCard variant="strong" className="p-6 h-fit space-y-6">
          <p className="text-sm text-muted-foreground text-center py-10">
            Select a device to see details and advanced controls.
          </p>
        </GlassCard>
      </div>

      {/* AlertDialog (Usuwanie) */}
      <AlertDialog open={!!deviceToDelete} onOpenChange={() => setDeviceToDelete(null)}>
        <AlertDialogContent className="glass border-white/20 rounded-[28px] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-semibold">Remove device?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to remove <span className="text-foreground font-medium">{deviceToDelete}</span> from the database? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-4">
            <AlertDialogCancel className="rounded-xl border-none bg-muted hover:bg-muted/80 transition-colors">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (deviceToDelete) handleDelete(deviceToDelete);
                setDeviceToDelete(null);
              }}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog (Zmiana nazwy) */}
      <Dialog open={!!deviceToRename} onOpenChange={(open) => { if (!open) setDeviceToRename(null) }}>
        <DialogContent className="glass border-white/20 rounded-[28px] max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Rename Device</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input 
              value={newName} 
              onChange={(e) => setNewName(e.target.value)} 
              placeholder="Enter new device name"
              className="bg-background/50 border-white/10 rounded-xl"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 mt-4">
            <Button 
              variant="outline" 
              onClick={() => setDeviceToRename(null)} 
              className="rounded-xl border-none bg-muted hover:bg-muted/80 transition-colors"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (deviceToRename && newName) {
                  handleRename(deviceToRename, newName);
                  setDeviceToRename(null);
                }
              }}
              className="rounded-xl transition-colors"
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Devices;