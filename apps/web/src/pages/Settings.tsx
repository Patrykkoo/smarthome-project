import { useState, useEffect } from "react";
import { User, Palette, Zap, Bell, Server, Check, Image as ImageIcon, LogOut, Key, UserPlus, Trash2, MapPin } from "lucide-react";
import { GlassCard } from "@/components/smartify/GlassCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { auth, User as AuthUser } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/use-theme";

const SECTIONS = [
  { id: "account", label: "Account & Profile", icon: User },
  { id: "general", label: "Home System", icon: Server },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "energy", label: "Energy & Billing", icon: Zap },
  { id: "notifications", label: "Notifications", icon: Bell },
];

const Settings = () => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme(); 
  const [activeSection, setActiveSection] = useState("account");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(auth.getCurrentUser());
  const isOwner = currentUser?.role === 'owner';

  const [homeUsers, setHomeUsers] = useState<AuthUser[]>([]);

  const loadHomeUsers = async () => {
    if (currentUser?.homeId) {
      const users = await auth.getUsersInHome(currentUser.homeId);
      setHomeUsers(users);
    }
  };

  useEffect(() => {
    loadHomeUsers();
  }, [currentUser]);

  const [userName, setUserName] = useState(currentUser?.username || '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatar || '');

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [inviteUsername, setInviteUsername] = useState("");

  const [homeName, setHomeName] = useState(localStorage.getItem('smartify_home_name') || 'My Smart Home');
  const [timeFormat, setTimeFormat] = useState(localStorage.getItem('smartify_time_format') || '24h');
  const [primaryDashboard, setPrimaryDashboard] = useState(localStorage.getItem('smartify_primary_dash') || '/');
  const [energyRate, setEnergyRate] = useState(localStorage.getItem('smartify_energy_rate') || '1.15');
  const [currency, setCurrency] = useState(localStorage.getItem('smartify_currency') || 'PLN');
  const [sysSounds, setSysSounds] = useState(localStorage.getItem('smartify_sys_sounds') !== 'false');
  const [alertOffline, setAlertOffline] = useState(localStorage.getItem('smartify_alert_offline') !== 'false');
  const [alertBattery, setAlertBattery] = useState(localStorage.getItem('smartify_alert_battery') !== 'false');

  const [cityName, setCityName] = useState(localStorage.getItem('smartify_location_name') || '');
  const [lat, setLat] = useState(localStorage.getItem('smartify_location_lat') || '');
  const [lon, setLon] = useState(localStorage.getItem('smartify_location_lon') || '');

  const handleSave = async () => {
    await auth.updateProfile({ username: userName, avatarUrl: avatarUrl });
    
    if (oldPassword && newPassword) {
      const pwSuccess = await auth.changePassword(oldPassword, newPassword);
      if (pwSuccess) {
        setOldPassword("");
        setNewPassword("");
        toast.success("PIN changed successfully");
      } else {
        toast.error("Incorrect current PIN");
        return; 
      }
    }
    
    if (cityName && lat && lon) {
      localStorage.setItem('smartify_location_name', cityName);
      localStorage.setItem('smartify_location_lat', lat);
      localStorage.setItem('smartify_location_lon', lon);
    } else {
      localStorage.removeItem('smartify_location_name');
      localStorage.removeItem('smartify_location_lat');
      localStorage.removeItem('smartify_location_lon');
    }

    localStorage.setItem('smartify_home_name', homeName);
    localStorage.setItem('smartify_time_format', timeFormat);
    localStorage.setItem('smartify_primary_dash', primaryDashboard);
    localStorage.setItem('smartify_energy_rate', energyRate);
    localStorage.setItem('smartify_currency', currency);
    localStorage.setItem('smartify_sys_sounds', String(sysSounds));
    localStorage.setItem('smartify_alert_offline', String(alertOffline));
    localStorage.setItem('smartify_alert_battery', String(alertBattery));

    window.dispatchEvent(new Event('user_settings_changed'));
    
    toast.success("Settings saved successfully", {
      icon: <Check className="h-4 w-4 text-emerald-500" />
    });
  };

  // DODANE: Zmiana zdarzeń z Toasta na globalne eventy (Menu Powiadomień)
  const handleInvite = async () => {
    if (!inviteUsername.trim() || !currentUser?.homeId) return;
    const success = await auth.inviteUserToHome(inviteUsername, currentUser.homeId);
    if (success) {
      window.dispatchEvent(new CustomEvent('app_notification', {
        detail: { type: 'success', title: 'New Home Member', description: `${inviteUsername} was added to your home network.` }
      }));
      setInviteUsername("");
      await loadHomeUsers();
    } else {
      toast.error(`User ${inviteUsername} not found.`);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    await auth.removeUserFromHome(userId);
    window.dispatchEvent(new CustomEvent('app_notification', {
        detail: { type: 'warning', title: 'Member Removed', description: `A user has been removed from your home network.` }
    }));
    await loadHomeUsers();
  };

  const handleRoleChange = async (userId: string, role: string) => {
    await auth.changeUserRole(userId, role as 'owner' | 'member');
    window.dispatchEvent(new CustomEvent('app_notification', {
        detail: { type: 'info', title: 'Role Updated', description: `User permissions have been modified.` }
    }));
    await loadHomeUsers();
  };

  const handleLogout = () => {
    auth.logout();
    navigate("/login");
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your account and home configuration.</p>
        </div>
        <Button 
          onClick={handleSave} 
          className="rounded-full px-6 shadow-md h-11 focus-visible:ring-0 active:scale-[0.98] transition-transform"
        >
          Save Changes
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6 items-start mt-6">
        <div className="flex flex-col gap-4">
          <GlassCard className="p-3 flex flex-col gap-1 w-full">
            {SECTIONS.map((sec) => (
              <button
                key={sec.id}
                onClick={() => setActiveSection(sec.id)}
                className={cn(
                  "w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus-visible:ring-0 active:scale-[0.98] transition-all",
                  activeSection === sec.id
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-foreground/70 bg-transparent hover:bg-muted/30"
                )}
              >
                <sec.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{sec.label}</span>
              </button>
            ))}
          </GlassCard>

          <button 
            onClick={handleLogout} 
            className="w-full flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold border border-destructive/20 bg-destructive/10 text-destructive active:scale-[0.98] transition-transform outline-none focus-visible:ring-0 shadow-sm"
          >
            <LogOut className="h-4 w-4 shrink-0" /> Log out
          </button>
        </div>

        <GlassCard className="p-6 md:p-8">
          {activeSection === "account" && (
            <div className="space-y-10 animate-fade-in">
              <div>
                <h2 className="font-display text-xl font-semibold mb-1">Account & Profile</h2>
                <p className="text-sm text-muted-foreground">Manage your personal information and security credentials.</p>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                <div className="h-20 w-20 rounded-full bg-muted border-2 border-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-display text-2xl font-bold uppercase">{userName.charAt(0) || '?'}</span>
                  )}
                </div>
                <div className="space-y-2 flex-1">
                  <p className="text-sm font-medium">Profile Picture URL</p>
                  <div className="relative">
                    <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)} placeholder="https://..." className="pl-10 h-12 rounded-xl bg-background/50 border-white/10 text-base max-w-sm focus-visible:ring-1" />
                  </div>
                </div>
              </div>
              
              <div className="space-y-3 pt-6 border-t border-border/40">
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold ml-1">Display Name</label>
                <Input value={userName} onChange={e => setUserName(e.target.value)} className="bg-background/50 border-white/10 rounded-xl text-base h-12 px-4 max-w-sm focus-visible:ring-1" />
              </div>

              <div className="space-y-4 pt-6 border-t border-border/40">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Key className="h-4 w-4" /> Change Security PIN</h3>
                <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
                  <Input type="password" maxLength={6} value={oldPassword} onChange={e => setOldPassword(e.target.value)} placeholder="Current 6-digit PIN" className="bg-background/50 border-white/10 rounded-xl text-base h-12 px-4 focus-visible:ring-1 tracking-widest font-display" />
                  <Input type="password" maxLength={6} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New 6-digit PIN" className="bg-background/50 border-white/10 rounded-xl text-base h-12 px-4 focus-visible:ring-1 tracking-widest font-display" />
                </div>
              </div>

              <div className="space-y-4 pt-6 border-t border-border/40">
                <h3 className="text-sm font-semibold flex items-center gap-2"><UserPlus className="h-4 w-4" /> Home Members</h3>
                <p className="text-xs text-muted-foreground mb-4">People who have access to this smart home.</p>
                
                <div className="grid gap-3 max-w-2xl">
                  {homeUsers.map(u => (
                    <div key={u.id} className="flex items-center justify-between p-3 rounded-2xl bg-background/40 border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 border border-white/10">
                          {u.avatar ? <img src={u.avatar} alt="Avatar" className="w-full h-full object-cover" /> : <span className="font-bold text-xs uppercase">{u.username.charAt(0)}</span>}
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{u.username} {u.id === currentUser?.id && <span className="text-muted-foreground font-normal">(You)</span>}</p>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{u.role}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Select 
                          value={u.role} 
                          onValueChange={(v) => handleRoleChange(u.id, v)} 
                          disabled={!isOwner || u.id === currentUser?.id}
                        >
                          <SelectTrigger className="w-[100px] h-9 rounded-lg bg-background/50 border-white/10 text-xs focus:ring-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-white/10 glass">
                            <SelectItem value="member" className="text-xs cursor-pointer">Member</SelectItem>
                            <SelectItem value="owner" className="text-xs cursor-pointer">Owner</SelectItem>
                          </SelectContent>
                        </Select>
                        
                        {isOwner && u.id !== currentUser?.id && (
                          <button 
                            onClick={() => handleRemoveUser(u.id)}
                            className="h-9 w-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors active:scale-95 outline-none focus-visible:ring-0"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {isOwner && (
                  <div className="flex items-center gap-3 max-w-sm mt-4">
                    <Input 
                      value={inviteUsername} 
                      onChange={e => setInviteUsername(e.target.value)} 
                      placeholder="Exact username" 
                      className="bg-background/50 border-white/10 rounded-xl text-base h-11 px-4 focus-visible:ring-1" 
                    />
                    <Button 
                      onClick={handleInvite} 
                      className="h-11 px-6 rounded-xl shadow-md focus-visible:ring-0 shrink-0"
                    >
                      Add User
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeSection === "general" && (
            <div className="space-y-8 animate-fade-in">
              <div>
                <h2 className="font-display text-xl font-semibold mb-1">Home System</h2>
                <p className="text-sm text-muted-foreground">Global configuration for this house.</p>
              </div>
              <div className="space-y-3">
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold ml-1">Home Name</label>
                <Input value={homeName} onChange={e => setHomeName(e.target.value)} className="bg-background/50 border-white/10 rounded-xl text-base h-12 px-4 max-w-md focus-visible:ring-1" />
              </div>

              <div className="space-y-4 pt-4 border-t border-border/40">
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold ml-1">Weather Location</label>
                  <p className="text-xs text-muted-foreground ml-1 mb-3">Enter your exact coordinates for weather and sun events.</p>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground ml-1">City Name (Display)</label>
                  <div className="relative max-w-md">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={cityName}
                      onChange={e => setCityName(e.target.value)}
                      placeholder="e.g. Szczecin"
                      className="pl-10 bg-background/50 border-white/10 rounded-xl text-base h-12 focus-visible:ring-1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 max-w-md">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground ml-1">Latitude</label>
                    <Input
                      value={lat}
                      onChange={e => setLat(e.target.value)}
                      placeholder="e.g. 53.4289"
                      className="bg-background/50 border-white/10 rounded-xl text-base h-12 focus-visible:ring-1 font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground ml-1">Longitude</label>
                    <Input
                      value={lon}
                      onChange={e => setLon(e.target.value)}
                      placeholder="e.g. 14.553"
                      className="bg-background/50 border-white/10 rounded-xl text-base h-12 focus-visible:ring-1 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-border/40">
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold ml-1">Time Format</label>
                <Select value={timeFormat} onValueChange={setTimeFormat}>
                  <SelectTrigger className="w-full max-w-xs h-12 text-base rounded-xl bg-background/50 border-white/10 px-4 focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-white/10 glass">
                    <SelectItem value="24h" className="py-3 cursor-pointer">24-hour (14:30)</SelectItem>
                    <SelectItem value="12h" className="py-3 cursor-pointer">12-hour (02:30 PM)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {activeSection === "appearance" && (
            <div className="space-y-8 animate-fade-in">
              <div>
                <h2 className="font-display text-xl font-semibold mb-1">Appearance</h2>
                <p className="text-sm text-muted-foreground">Customize the look and feel.</p>
              </div>
              <div className="space-y-3">
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold ml-1">Color Theme</label>
                <Select value={theme} onValueChange={(v) => setTheme(v as any)}>
                  <SelectTrigger className="w-full max-w-xs h-12 text-base rounded-xl bg-background/50 border-white/10 px-4 focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-white/10 glass">
                    <SelectItem value="system" className="py-3 cursor-pointer">System default</SelectItem>
                    <SelectItem value="light" className="py-3 cursor-pointer">Light</SelectItem>
                    <SelectItem value="dark" className="py-3 cursor-pointer">Dark</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3 pt-4 border-t border-border/40">
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold ml-1">Primary View</label>
                <Select value={primaryDashboard} onValueChange={setPrimaryDashboard}>
                  <SelectTrigger className="w-full max-w-xs h-12 text-base rounded-xl bg-background/50 border-white/10 px-4 focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-white/10 glass">
                    <SelectItem value="/" className="py-3 cursor-pointer">Dashboard</SelectItem>
                    <SelectItem value="/devices" className="py-3 cursor-pointer">Devices & Rooms</SelectItem>
                    <SelectItem value="/energy" className="py-3 cursor-pointer">Energy Overview</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {activeSection === "energy" && (
            <div className="space-y-8 animate-fade-in">
              <div>
                <h2 className="font-display text-xl font-semibold mb-1">Energy & Billing</h2>
                <p className="text-sm text-muted-foreground">Configure rates for accurate cost estimations.</p>
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-3">
                  <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold ml-1">Price per kWh</label>
                  <Input type="number" step="0.01" value={energyRate} onChange={e => setEnergyRate(e.target.value)} className="bg-background/50 border-white/10 rounded-xl h-12 px-4 focus-visible:ring-1" />
                </div>
                <div className="space-y-3">
                  <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold ml-1">Currency</label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="w-full h-12 rounded-xl bg-background/50 border-white/10 px-4 focus:ring-0"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-xl glass">
                      <SelectItem value="PLN" className="cursor-pointer">PLN (Złoty)</SelectItem>
                      <SelectItem value="EUR" className="cursor-pointer">EUR (Euro)</SelectItem>
                      <SelectItem value="USD" className="cursor-pointer">USD (Dollar)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {activeSection === "notifications" && (
            <div className="space-y-8 animate-fade-in">
              <div>
                <h2 className="font-display text-xl font-semibold mb-1">Notifications</h2>
                <p className="text-sm text-muted-foreground">Control what gets your attention.</p>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-background/40 border border-white/5">
                  <div><p className="text-sm font-semibold">Audible Alarms</p><p className="text-xs text-muted-foreground">Play an audio alert when a safety sensor is triggered.</p></div>
                  <Switch checked={sysSounds} onCheckedChange={setSysSounds} />
                </div>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-background/40 border border-white/5">
                  <div><p className="text-sm font-semibold">Offline Alerts</p><p className="text-xs text-muted-foreground">Notify when a device loses network connection.</p></div>
                  <Switch checked={alertOffline} onCheckedChange={setAlertOffline} />
                </div>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-background/40 border border-white/5">
                  <div><p className="text-sm font-semibold">Low Battery Warnings</p><p className="text-xs text-muted-foreground">Notify when a device's battery falls below 15%.</p></div>
                  <Switch checked={alertBattery} onCheckedChange={setAlertBattery} />
                </div>
              </div>
            </div>
          )}

        </GlassCard>
      </div>
    </div>
  );
};

export default Settings;