import { useState, useMemo } from "react";
import { 
  Sun, Sparkles, PartyPopper, Moon, Film, Coffee, Plus, Clock, Pencil, Trash2, 
  Lightbulb, Plug, BedDouble, Music, Gamepad2, Zap, Settings2, Trash, Check,
  Thermometer, Palette, Lock, Unlock, ShieldAlert, Activity, PlaySquare, Minus, Cpu
} from "lucide-react";
import { GlassCard } from "@/components/livora/GlassCard";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColorWheel } from "@/components/livora/ColorWheel";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDevices } from "@/hooks/use-devices";
import axios from "axios";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle 
} from "@/components/ui/alert-dialog";
import { hslToHex } from "@/lib/color";

const API_URL = import.meta.env.VITE_API_URL;

const AVAILABLE_ICONS: Record<string, React.ElementType> = {
  Sun, Moon, Coffee, Film, Sparkles, PartyPopper, Zap, BedDouble, Music, Gamepad2, Lightbulb
};

const AVAILABLE_COLORS = [
  "from-amber-200/50 to-yellow-100/30",
  "from-slate-300/40 to-blue-200/30",
  "from-pink-200/50 to-purple-200/30",
  "from-blue-200/50 to-indigo-200/30",
  "from-purple-300/50 to-fuchsia-200/30",
  "from-emerald-200/50 to-teal-200/30"
];

// Dostępne parametry urządzeń jako wyzwalacze (Trigger Properties)
const DEVICE_PROPERTIES = [
  { key: 'contact', label: 'Door/Window Contact', options: [{label: 'Open', value: 'false'}, {label: 'Closed', value: 'true'}] },
  { key: 'water_leak', label: 'Water Leak Sensor', options: [{label: 'Leak Detected', value: 'true'}, {label: 'Dry', value: 'false'}] },
  { key: 'tamper', label: 'Tamper Alarm', options: [{label: 'Alert', value: 'true'}, {label: 'Safe', value: 'false'}] },
  { key: 'state', label: 'Power State', options: [{label: 'Turned ON', value: 'ON'}, {label: 'Turned OFF', value: 'OFF'}] }
];

const Scenes = () => {
  const queryClient = useQueryClient();
  const { data: devices = [] } = useDevices();
  
  const [activeSceneId, setActiveSceneId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sceneToDelete, setSceneToDelete] = useState<number | null>(null);
  
  const [formData, setFormData] = useState<{ id?: number, name: string, icon: string, color: string, actions: any[] }>({
    name: "", icon: "Sparkles", color: AVAILABLE_COLORS[0], actions: []
  });

  // STANY AUTOMATYZACJI
  const [isAutoModalOpen, setIsAutoModalOpen] = useState(false);
  const [autoToDelete, setAutoToDelete] = useState<number | null>(null);
  const [autoForm, setAutoForm] = useState<any>({ 
    name: "", 
    is_enabled: true, 
    trigger_type: "time", 
    trigger_config: { device: "", property: "", value: "", time: "08:00" }, 
    condition_config: { mode: "any" },
    action_config: { scene_id: "" } 
  });

  const { data: scenes = [], isLoading: isLoadingScenes } = useQuery({
    queryKey: ['scenes'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/scenes`);
      return res.data;
    }
  });

  const { data: automations = [], isLoading: isLoadingAuto } = useQuery({
      queryKey: ['automations'],
      queryFn: async () => {
        const res = await axios.get(`${API_URL}/automations`);
        return res.data;
      }
  });

  const handleTrigger = async (id: number) => {
    setActiveSceneId(id);
    try {
      await axios.post(`${API_URL}/scenes/${id}/trigger`);
    } catch (error) {
      toast.error("Failed to trigger scene");
    }
  };

  const handleSaveScene = async () => {
    if (!formData.name.trim()) {
      toast.error("Scene name cannot be empty");
      return;
    }

    try {
      if (formData.id) {
        await axios.put(`${API_URL}/scenes/${formData.id}`, formData);
        toast.success("Scene updated");
      } else {
        await axios.post(`${API_URL}/scenes`, formData);
        toast.success("Scene created");
      }
      queryClient.invalidateQueries({ queryKey: ['scenes'] });
      setIsModalOpen(false);
    } catch (error) {
      toast.error("Failed to save scene");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`${API_URL}/scenes/${id}`);
      toast.success("Scene deleted");
      if (activeSceneId === id) setActiveSceneId(null);
      queryClient.invalidateQueries({ queryKey: ['scenes'] });
      // Odświeżenie automatyzacji (być może korzystały z tej usuniętej sceny)
      queryClient.invalidateQueries({ queryKey: ['automations'] });
    } catch (error) {
      toast.error("Failed to delete scene");
    }
  };

  const isActuator = (d: any) => {
    const live = d.last_payload || {};
    if (live.contact !== undefined || live.water_leak !== undefined || (live.temperature !== undefined && live.current_heating_setpoint === undefined)) {
        return false;
    }
    return live.state !== undefined || live.brightness !== undefined || live.current_heating_setpoint !== undefined;
  };

  const hasFeature = (device: any, property: string) => {
    if (!device) return false;
    if (device.last_payload && device.last_payload[property] !== undefined) return true;
    try {
      const exposesStr = typeof device.exposes === 'string' ? device.exposes : JSON.stringify(device.exposes || {});
      return exposesStr.includes(`"property":"${property}"`);
    } catch { return false; }
  };

  const addAction = (friendlyName: string) => {
    const dev = devices.find((d: any) => d.friendly_name === friendlyName);
    if (!dev) return;

    const newAction = {
      device_id: dev.id,
      friendly_name: dev.friendly_name,
      payload: { state: "ON" }
    };

    setFormData(prev => ({ ...prev, actions: [...prev.actions, newAction] }));
  };

  const updateActionPayload = (index: number, key: string, value: any) => {
    setFormData(prev => {
      const newActions = [...prev.actions];
      newActions[index] = {
        ...newActions[index],
        payload: { ...newActions[index].payload, [key]: value }
      };
      return { ...prev, actions: newActions };
    });
  };

  const removeAction = (index: number) => {
    setFormData(prev => ({
      ...prev,
      actions: prev.actions.filter((_, i) => i !== index)
    }));
  };

  const openEditor = (scene?: any) => {
    if (scene) {
      setFormData({ id: scene.id, name: scene.name, icon: scene.icon, color: scene.color, actions: scene.actions || [] });
    } else {
      setFormData({ name: "", icon: "Sparkles", color: AVAILABLE_COLORS[0], actions: [] });
    }
    setIsModalOpen(true);
  };

  // LOGIKA AUTOMATYZACJI
  const toggleAutomation = async (id: number, enabled: boolean) => {
      const auto = automations.find((a:any) => a.id === id);
      if (!auto) return;
      try {
          await axios.put(`${API_URL}/automations/${id}`, { ...auto, is_enabled: enabled });
          queryClient.invalidateQueries({ queryKey: ['automations'] });
      } catch (e) { toast.error("Failed to toggle automation"); }
  }

  const saveAutomation = async () => {
      if (!autoForm.name.trim()) return toast.error("Rule name cannot be empty");
      if (autoForm.trigger_type === 'device_state' && (!autoForm.trigger_config.device || !autoForm.trigger_config.property || !autoForm.trigger_config.value)) {
          return toast.error("Please complete the trigger details");
      }
      if (!autoForm.action_config.scene_id) return toast.error("Select an action to execute");

      try {
          if (autoForm.id) {
            await axios.put(`${API_URL}/automations/${autoForm.id}`, autoForm);
            toast.success("Automation rule updated");
          } else {
            await axios.post(`${API_URL}/automations`, autoForm);
            toast.success("Automation rule created");
          }
          queryClient.invalidateQueries({ queryKey: ['automations'] });
          setIsAutoModalOpen(false);
      } catch (e) { toast.error("Failed to save automation rule"); }
  }

  const openAutoEditor = (auto?: any) => {
    if (auto) {
        setAutoForm({ 
          id: auto.id, 
          name: auto.name, 
          is_enabled: auto.is_enabled, 
          trigger_type: auto.trigger_type, 
          trigger_config: auto.trigger_config || {}, 
          condition_config: auto.condition_config || {mode: "any"}, 
          action_config: auto.action_config || {} 
        });
    } else {
        setAutoForm({ 
          name: "", 
          is_enabled: true, 
          trigger_type: "time", 
          trigger_config: { device: "", property: "", value: "", time: "08:00" }, 
          condition_config: { mode: "any" }, 
          action_config: { scene_id: "" } 
        });
    }
    setIsAutoModalOpen(true);
  };

  const deleteAutomation = async (id: number) => {
    try {
      await axios.delete(`${API_URL}/automations/${id}`);
      toast.success("Automation rule deleted");
      queryClient.invalidateQueries({ queryKey: ['automations'] });
    } catch (error) {
      toast.error("Failed to delete automation rule");
    }
  };

  // Wyliczanie opcji dla wybranego czujnika
  const activeTriggerDeviceProps = useMemo(() => {
    if (!autoForm.trigger_config?.device) return [];
    const d = devices.find((x:any) => x.friendly_name === autoForm.trigger_config.device);
    return DEVICE_PROPERTIES.filter(prop => hasFeature(d, prop.key));
  }, [autoForm.trigger_config?.device, devices]);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Scenes & Automations</h1>
          <p className="text-sm text-muted-foreground mt-1">One tap to set the mood. Rules to do it for you.</p>
        </div>
        <Button onClick={() => openEditor()} className="rounded-full px-5 py-2.5 shadow-md transition-all h-11 focus-visible:ring-0">
          <Plus className="h-4 w-4 mr-2" /> Create scene
        </Button>
      </div>

      <section>
        <h2 className="font-display text-xl font-semibold mb-4">Scenes</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoadingScenes ? (
            <p className="text-muted-foreground py-10 col-span-full">Loading scenes...</p>
          ) : scenes.length === 0 ? (
            <div className="col-span-full py-12 flex flex-col items-center justify-center border border-white/10 rounded-[28px] bg-muted/10">
              <Sparkles className="h-10 w-10 text-muted-foreground mb-3 opacity-50" />
              <p className="font-medium text-foreground">No scenes yet</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">Create your first scene to control multiple devices at once.</p>
              <Button onClick={() => openEditor()} className="rounded-xl h-11 shadow-md focus-visible:ring-0">Create Scene</Button>
            </div>
          ) : (
            scenes.map((s: any) => {
              const IconComp = AVAILABLE_ICONS[s.icon] || Sparkles;
              const isActive = activeSceneId === s.id;
              
              return (
                <GlassCard 
                  key={s.id} 
                  variant={isActive ? "strong" : "default"}
                  onClick={() => handleTrigger(s.id)}
                  className="p-6 cursor-pointer relative overflow-hidden min-h-[160px]"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${s.color} opacity-${isActive ? "100" : "60"} pointer-events-none transition-opacity duration-500`} />
                  
                  <div className="relative z-10">
                    <div className="flex items-start justify-between">
                      <div className="h-12 w-12 rounded-2xl bg-white/70 dark:bg-black/40 flex items-center justify-center backdrop-blur-md border border-white/20">
                        <IconComp className="h-5 w-5 text-foreground" />
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {isActive && (
                          <span className="rounded-full bg-primary text-primary-foreground text-xs px-3 py-1 font-medium shadow-sm">
                            Active
                          </span>
                        )}
                        <button 
                          onClick={(e) => { e.stopPropagation(); openEditor(s); }} 
                          className="h-10 w-10 rounded-full bg-background/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background/80 transition-all backdrop-blur-sm opacity-80 active:scale-95 focus-visible:ring-0"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    
                    <h3 className="mt-6 font-display text-xl font-semibold">{s.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{s.actions?.length || 0} devices included</p>
                  </div>
                </GlassCard>
              );
            })
          )}
        </div>
      </section>

      {/* SEKCJA AUTOMATYZACJI */}
      <section className="pt-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-semibold">Automations</h2>
          <Button onClick={() => openAutoEditor()} className="rounded-full px-5 py-2.5 shadow-md transition-all h-11 focus-visible:ring-0">
            <Plus className="h-4 w-4 mr-2" /> Create Automation
          </Button>
        </div>

        {isLoadingAuto ? (
          <p className="text-muted-foreground py-10 col-span-full">Loading automations...</p>
        ) : automations.length === 0 ? (
          <div className="col-span-full py-12 flex flex-col items-center justify-center border border-white/10 rounded-[28px] bg-muted/10">
            <Settings2 className="h-10 w-10 text-muted-foreground mb-3 opacity-50" />
            <p className="font-medium text-foreground">No automations yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">Create your first rule to automate devices.</p>
            <Button onClick={() => openAutoEditor()} className="rounded-xl h-11 shadow-md focus-visible:ring-0">Create Automation</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {automations.map((a: any) => {
              let desc = "Triggered by event";
              let IconObj = Activity;
              
              if (a.trigger_type === 'time') { 
                  desc = `At ${a.trigger_config?.time || "unknown time"}`; 
                  IconObj = Clock; 
              }
              else if (a.trigger_type === 'device_state' && a.trigger_config?.device) { 
                  desc = `When ${a.trigger_config.device} updates`; 
                  IconObj = ShieldAlert; 
              }
              
              if (a.condition_config?.mode && a.condition_config.mode !== "any") {
                  desc += ` (Only if ${a.condition_config.mode})`;
              }

              return (
                <GlassCard 
                  key={a.id} 
                  hover
                  onClick={() => openAutoEditor(a)}
                  className={cn(
                    "px-5 py-3.5 cursor-pointer flex items-center gap-4 transition-all duration-300",
                    !a.is_enabled && "opacity-60 grayscale-[30%]"
                  )}
                >
                  <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center border border-white/5 backdrop-blur-md shrink-0">
                    <IconObj className="h-4.5 w-4.5 text-foreground" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display text-base font-semibold truncate leading-tight">{a.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{desc}</p>
                  </div>
                  
                  <div className="flex items-center gap-2 shrink-0">
                    <div onClick={(e) => e.stopPropagation()}>
                      <Switch checked={a.is_enabled} onCheckedChange={(v) => toggleAutomation(a.id, v)} />
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); openAutoEditor(a); }} 
                      className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background/60 transition-all active:scale-95 focus-visible:ring-0"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}
      </section>

      {/* ===================================== */}
      {/* MODAL KREATORA SCEN */}
      {/* ===================================== */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="glass border-white/20 rounded-[28px] max-w-2xl p-0 overflow-hidden flex flex-col max-h-[85vh]">
          <DialogHeader className="p-6 pb-2 shrink-0">
            <DialogTitle className="font-display text-2xl">{formData.id ? "Edit Scene" : "Create New Scene"}</DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-8 no-scrollbar">
            <div className="space-y-5">
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2 ml-1 block">Scene Name</label>
                <Input 
                  value={formData.name} 
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Movie Night"
                  className="bg-background/50 border-white/10 rounded-xl text-base h-12 px-4"
                />
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2 ml-1 block">Icon</label>
                <div className="flex flex-wrap gap-2.5">
                  {Object.entries(AVAILABLE_ICONS).map(([key, Icon]) => (
                    <button
                      key={key}
                      onClick={() => setFormData(prev => ({ ...prev, icon: key }))}
                      className={cn(
                        "h-12 w-12 rounded-2xl flex items-center justify-center transition-all",
                        formData.icon === key ? "bg-primary text-primary-foreground shadow-md" : "bg-background/40 hover:bg-background/80 text-muted-foreground"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2 ml-1 block">Color Theme</label>
                <div className="flex flex-wrap gap-3">
                  {AVAILABLE_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => setFormData(prev => ({ ...prev, color }))}
                      className={cn(
                        "h-12 w-12 rounded-full border-2 transition-all p-1",
                        formData.color === color ? "border-primary scale-110" : "border-transparent hover:scale-105"
                      )}
                    >
                      <div className={`h-full w-full rounded-full bg-gradient-to-br ${color} shadow-inner`} />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-border/40">
              <div className="flex items-center justify-between">
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold ml-1 block mb-0">Device Actions</label>
                
                <Select onValueChange={addAction}>
                  <SelectTrigger className="w-[200px] h-11 text-sm rounded-xl bg-background/50 border-white/10">
                    <SelectValue placeholder="Add device..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-white/10 glass">
                    {devices.filter((d:any) => !formData.actions.find(a => a.device_id === d.id) && isActuator(d)).map((d: any) => (
                      <SelectItem key={d.id} value={d.friendly_name} className="cursor-pointer py-3">
                        {d.friendly_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.actions.length === 0 ? (
                <div className="text-center py-10 bg-background/30 rounded-3xl border border-white/10">
                  <Settings2 className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-base font-medium text-foreground/80">No devices configured</p>
                  <p className="text-sm text-muted-foreground mt-1">Select devices from the list above to automate them.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {formData.actions.map((action, index) => {
                    const devMeta = devices.find((d: any) => d.id === action.device_id);
                    const p = devMeta?.last_payload || {};
                    
                    const hasBrightness = p.brightness !== undefined;
                    const hasColorTemp = p.color_temp !== undefined || p.color_mode === 'color_temp';
                    const hasColor = p.color !== undefined || p.color_mode === 'hs' || p.color_mode === 'xy';
                    const hasChildLock = p.child_lock !== undefined;
                    
                    const isBulb = hasBrightness || hasColorTemp || hasColor;

                    return (
                      <div key={index} className="bg-card border border-border/60 shadow-sm rounded-3xl overflow-hidden flex flex-col transition-all">
                        {/* HEADER URZĄDZENIA */}
                        <div className="bg-muted/20 px-4 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-background border border-border/50 flex items-center justify-center text-foreground shadow-sm shrink-0">
                              {isBulb ? <Lightbulb className="h-5 w-5" /> : <Plug className="h-5 w-5" />}
                            </div>
                            <span className="font-semibold text-base truncate max-w-[140px] sm:max-w-[200px]">{action.friendly_name}</span>
                          </div>
                          
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-medium text-muted-foreground mr-2 hidden sm:block">
                              {action.payload.state === "ON" ? "Turn On" : "Turn Off"}
                            </span>
                            <Switch 
                              checked={action.payload.state === "ON"} 
                              onCheckedChange={(v) => updateActionPayload(index, "state", v ? "ON" : "OFF")}
                            />
                            <div className="w-px h-5 bg-border mx-2"></div>
                            {/* Zwiększony przycisk kosza */}
                            <button 
                              onClick={() => removeAction(index)} 
                              className="h-10 w-10 flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors active:scale-95 focus-visible:ring-0"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </div>
                        </div>

                        {/* OPCJE (Tylko jeśli ON i są dostępne ficzery) */}
                        {action.payload.state === "ON" && (hasBrightness || hasColorTemp || hasColor || hasChildLock) && (
                          <div className="p-5 bg-background/40 border-t border-border/40 flex flex-col gap-6">
                            
                            {hasBrightness && (
                              <div>
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-sm text-muted-foreground font-medium flex items-center gap-1.5"><Sun className="h-4 w-4" /> Brightness</span>
                                  <span className="text-sm font-bold">{Math.round(((action.payload.brightness || 254) / 254) * 100)}%</span>
                                </div>
                                <div className="px-1 py-2">
                                  <Slider 
                                    value={[action.payload.brightness || 254]} 
                                    max={254} step={1}
                                    onValueChange={(v) => updateActionPayload(index, "brightness", v[0])}
                                  />
                                </div>
                              </div>
                            )}

                            {hasColorTemp && (
                              <div>
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-sm text-muted-foreground font-medium flex items-center gap-1.5"><Thermometer className="h-4 w-4" /> Temperature</span>
                                  <span className="text-sm font-bold">{Math.round(1000000 / (action.payload.color_temp || 250))}K</span>
                                </div>
                                <div className="px-1 py-2">
                                  <Slider 
                                    value={[1000000 / (action.payload.color_temp || 250)]} 
                                    min={2000} max={6000} step={100}
                                    onValueChange={(v) => {
                                      updateActionPayload(index, "color_temp", Math.round(1000000/v[0]));
                                      updateActionPayload(index, "color_mode", "color_temp");
                                    }}
                                  />
                                </div>
                                <div
                                  className="mt-3 h-2 rounded-full mx-1"
                                  style={{ background: "linear-gradient(to right, #FF8B3D 0%, #FFB870 25%, #FFE4B5 50%, #FFFFFF 75%, #CFE2FF 100%)" }}
                                />
                              </div>
                            )}

                            {hasColor && (
                              <div className="flex flex-col items-center justify-center bg-muted/20 rounded-2xl p-4 border border-border/50">
                                <span className="text-sm text-muted-foreground font-medium flex items-center gap-1.5 mb-4 w-full"><Palette className="h-4 w-4" /> Color</span>
                                {/* Powiększone koło kolorów do 180px */}
                                <ColorWheel 
                                  hue={action.payload.color?.h || 0} 
                                  saturation={action.payload.color?.s || 100}
                                  className="max-w-[180px] w-full"
                                  onChange={(h, s) => {
                                    updateActionPayload(index, "color", { h, s });
                                    updateActionPayload(index, "color_mode", "hs");
                                  }}
                                />
                                <p className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground mt-4">
                                  {action.payload.color ? hslToHex(action.payload.color.h, action.payload.color.s, 50) : "DEFAULT"}
                                </p>
                              </div>
                            )}

                            {/* Child Lock */}
                            {hasChildLock && (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", action.payload.child_lock === "LOCK" ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground")}>
                                    {action.payload.child_lock === "LOCK" ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                                  </div>
                                  <span className="text-sm font-medium">Child Lock</span>
                                </div>
                                <Switch 
                                  checked={action.payload.child_lock === "LOCK"} 
                                  onCheckedChange={(v) => updateActionPayload(index, "child_lock", v ? "LOCK" : "UNLOCK")}
                                />
                              </div>
                            )}

                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          
          <DialogFooter className="p-6 pt-4 border-t border-border/40 bg-background/20 shrink-0 sm:justify-between w-full flex items-center">
            {formData.id ? (
              <Button 
                type="button" 
                variant="ghost" 
                onClick={() => { setIsModalOpen(false); setSceneToDelete(formData.id!); }} 
                className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl px-4 h-12 focus-visible:ring-0"
              >
                <Trash2 className="h-5 w-5 mr-2" /> Delete
              </Button>
            ) : <div />}
            
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => setIsModalOpen(false)} className="rounded-xl border-none bg-muted hover:bg-muted/80 h-12 px-6 focus-visible:ring-0">Cancel</Button>
              <Button onClick={handleSaveScene} className="rounded-xl shadow-md h-12 px-8 focus-visible:ring-0">Save Scene</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================================== */}
      {/* MODAL KREATORA AUTOMATYZACJI */}
      {/* ===================================== */}
      <Dialog open={isAutoModalOpen} onOpenChange={setIsAutoModalOpen}>
        <DialogContent className="glass border-white/20 rounded-[28px] max-w-xl p-0 overflow-hidden flex flex-col max-h-[85vh]">
          <DialogHeader className="p-6 pb-2 shrink-0 border-b border-white/10 bg-background/20">
            <DialogTitle className="font-display text-2xl">{autoForm.id ? "Edit Automation" : "New Automation"}</DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-8 no-scrollbar">
            
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2 ml-1 block">Rule Name</label>
              <Input 
                value={autoForm.name} 
                onChange={e => setAutoForm((prev:any) => ({ ...prev, name: e.target.value }))} 
                placeholder="e.g. Sunset Lights" 
                className="bg-background/50 border-white/10 rounded-xl text-base h-12 px-4" 
              />
            </div>

            {/* BLOCK 1: TRIGGER */}
            <div className="space-y-4">
              <label className="text-xs uppercase tracking-wider text-foreground font-semibold mb-2 ml-1 block">Trigger Event</label>

              <div 
                role="tablist" 
                aria-label="Trigger type" 
                className="relative grid grid-cols-2 items-center glass rounded-full p-1 h-11 bg-background/20 border border-white/10 select-none"
              >
                <div 
                  aria-hidden 
                  className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-primary shadow-lg transition-transform duration-300 ease-out" 
                  style={{ transform: `translateX(${autoForm.trigger_type === "time" ? "4px" : "calc(100% + 4px)"})` }} 
                />
                <button 
                  type="button" role="tab" 
                  aria-selected={autoForm.trigger_type === "time"} 
                  onClick={() => setAutoForm((p:any) => ({ ...p, trigger_type: "time", trigger_config: { time: "08:00" } }))} 
                  className={cn("relative z-10 inline-flex items-center justify-center gap-1.5 h-9 rounded-full text-sm font-medium transition-colors outline-none", autoForm.trigger_type === "time" ? "text-primary-foreground" : "text-muted-foreground")}
                >
                  <Clock className="h-4 w-4" /> Time
                </button>
                <button 
                  type="button" role="tab" 
                  aria-selected={autoForm.trigger_type === "device_state"} 
                  onClick={() => setAutoForm((p:any) => ({ ...p, trigger_type: "device_state", trigger_config: { device: "", property: "", value: "" } }))} 
                  className={cn("relative z-10 inline-flex items-center justify-center gap-1.5 h-9 rounded-full text-sm font-medium transition-colors outline-none", autoForm.trigger_type === "device_state" ? "text-primary-foreground" : "text-muted-foreground")}
                >
                  <Cpu className="h-4 w-4" /> Device
                </button>
              </div>

              <div className="pt-2">
                {autoForm.trigger_type === "time" && (() => {
                  const [hStr, mStr] = (autoForm.trigger_config.time || "08:00").split(":");
                  const h = parseInt(hStr,10)||0, m = parseInt(mStr,10)||0;
                  const setTime = (nh:number, nm:number) => {
                    const hh = ((nh%24)+24)%24, mm = ((nm%60)+60)%60;
                    const t = `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
                    setAutoForm((p:any) => ({ ...p, trigger_config: { ...p.trigger_config, time: t } }));
                  };
                  const StepBtn = ({ onClick, children }:any) => (
                    <button type="button" onClick={onClick} className="h-10 w-10 shrink-0 rounded-full bg-background/80 border border-border/50 flex items-center justify-center text-foreground hover:bg-primary hover:text-primary-foreground hover:border-transparent transition">
                      {children}
                    </button>
                  );
                  const Unit = ({ value, onDec, onInc, label }:any) => (
                    <div className="flex items-center gap-3 flex-1 min-w-0 justify-center">
                      <StepBtn onClick={onDec}><Minus className="h-4 w-4" /></StepBtn>
                      <div className="text-center leading-none">
                        <p className="font-display text-3xl font-semibold tabular-nums">{String(value).padStart(2,"0")}</p>
                        <p className="mt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
                      </div>
                      <StepBtn onClick={onInc}><Plus className="h-4 w-4" /></StepBtn>
                    </div>
                  );
                  return (
                    <div className="rounded-2xl bg-background/50 border border-border/40 px-4 py-4 flex items-center justify-between gap-2">
                      <Unit label="Hour"   value={h} onDec={() => setTime(h-1, m)} onInc={() => setTime(h+1, m)} />
                      <span className="font-display text-2xl font-semibold text-muted-foreground">:</span>
                      <Unit label="Minute" value={m} onDec={() => setTime(h, m-5)} onInc={() => setTime(h, m+5)} />
                    </div>
                  );
                })()}

                {autoForm.trigger_type === "device_state" && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 ml-1 block">Which Device?</label>
                      <Select value={autoForm.trigger_config.device} onValueChange={(v) => setAutoForm((prev:any) => ({ ...prev, trigger_config: {...prev.trigger_config, device: v, property: "", value: ""} }))}>
                        <SelectTrigger className="w-full h-12 text-base rounded-xl bg-background/50 border-white/10 px-4"><SelectValue placeholder="Select a sensor..." /></SelectTrigger>
                        <SelectContent className="rounded-xl border-white/10 glass">
                          {devices.map((d: any) => (<SelectItem key={d.id} value={d.friendly_name} className="py-3 cursor-pointer">{d.friendly_name}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>

                    {autoForm.trigger_config.device && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 ml-1 block">Property</label>
                          <Select value={autoForm.trigger_config.property} onValueChange={(v) => setAutoForm((prev:any) => ({ ...prev, trigger_config: {...prev.trigger_config, property: v, value: ""} }))}>
                            <SelectTrigger className="w-full h-12 text-base rounded-xl bg-background/50 border-white/10 px-4"><SelectValue placeholder="Select..." /></SelectTrigger>
                            <SelectContent className="rounded-xl border-white/10 glass">
                              {activeTriggerDeviceProps.map(prop => (<SelectItem key={prop.key} value={prop.key} className="py-3 cursor-pointer">{prop.label}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 ml-1 block">Becomes</label>
                          <Select value={autoForm.trigger_config.value} onValueChange={(v) => setAutoForm((prev:any) => ({ ...prev, trigger_config: {...prev.trigger_config, value: v} }))}>
                            <SelectTrigger className="w-full h-12 text-base rounded-xl bg-background/50 border-white/10 px-4"><SelectValue placeholder="Value..." /></SelectTrigger>
                            <SelectContent className="rounded-xl border-white/10 glass">
                              {activeTriggerDeviceProps.find(p => p.key === autoForm.trigger_config.property)?.options.map(o => (
                                <SelectItem key={o.value} value={o.value} className="py-3 cursor-pointer">{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* BLOCK 2: CONDITION */}
            <div className="pt-6 border-t border-border/40 space-y-3">
              <label className="text-xs uppercase tracking-wider text-foreground font-semibold mb-2 ml-1 block">Condition (Optional)</label>
              <Select value={autoForm.condition_config?.mode || "any"} onValueChange={(v) => setAutoForm((prev:any) => ({ ...prev, condition_config: {mode: v} }))}>
                <SelectTrigger className="w-full h-12 text-base rounded-xl bg-background/50 border-white/10 px-4">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-white/10 glass">
                  <SelectItem value="any" className="py-3 cursor-pointer">Always allow</SelectItem>
                  <SelectItem value="home" className="py-3 cursor-pointer">Only when I'm Home</SelectItem>
                  <SelectItem value="away" className="py-3 cursor-pointer">Only when I'm Away</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* BLOCK 3: ACTION */}
            <div className="pt-6 border-t border-border/40 space-y-3">
              <label className="text-xs uppercase tracking-wider text-primary font-bold mb-2 ml-1 block">Scene To Run</label>
              <Select value={autoForm.action_config?.scene_id ? String(autoForm.action_config.scene_id) : ""} onValueChange={(v) => setAutoForm((prev:any) => ({ ...prev, action_config: {scene_id: Number(v)} }))}>
                <SelectTrigger className="w-full h-12 text-base rounded-xl bg-background/50 border-white/10 px-4 shadow-sm border-primary/30">
                  <SelectValue placeholder="Select a Scene..." />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-white/10 glass">
                  {scenes.map((s:any) => {
                    const IconComp = AVAILABLE_ICONS[s.icon] || Sparkles;
                    return (
                      <SelectItem key={s.id} value={String(s.id)} className="py-3 cursor-pointer">
                        <div className="flex items-center gap-3">
                           <div className="h-6 w-6 rounded-md bg-muted flex items-center justify-center shrink-0">
                               <IconComp className="h-3.5 w-3.5" />
                           </div>
                           <span className="font-semibold">{s.name}</span>
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

          </div>
          
          <DialogFooter className="p-6 pt-4 border-t border-border/40 bg-background/20 shrink-0 sm:justify-between w-full flex items-center">
            {autoForm.id ? (
              <Button type="button" variant="ghost" onClick={() => { setIsAutoModalOpen(false); setAutoToDelete(autoForm.id!); }} className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl px-4 h-12 focus-visible:ring-0">
                <Trash2 className="h-5 w-5 mr-2" /> Delete
              </Button>
            ) : <div />}
            
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => setIsAutoModalOpen(false)} className="rounded-xl border-none bg-muted hover:bg-muted/80 h-12 px-6 focus-visible:ring-0">Cancel</Button>
              <Button onClick={saveAutomation} className="rounded-xl shadow-md h-12 px-8 focus-visible:ring-0">Save Rule</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!sceneToDelete} onOpenChange={() => setSceneToDelete(null)}>
        <AlertDialogContent className="glass border-white/20 rounded-[28px] max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Scene?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this scene? You will lose its device configuration.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl border-none bg-muted hover:bg-muted/80 h-11 focus-visible:ring-0">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (sceneToDelete) handleDelete(sceneToDelete); setSceneToDelete(null); }} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 h-11 focus-visible:ring-0">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!autoToDelete} onOpenChange={() => setAutoToDelete(null)}>
        <AlertDialogContent className="glass border-white/20 rounded-[28px] max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rule?</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to permanently delete this automation rule?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl border-none bg-muted hover:bg-muted/80 h-11 focus-visible:ring-0">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (autoToDelete) deleteAutomation(autoToDelete); setAutoToDelete(null); }} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 h-11 focus-visible:ring-0">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

export default Scenes;