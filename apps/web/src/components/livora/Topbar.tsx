import { Bell, Search } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";

export function Topbar() {
  const [home, setHome] = useState(true);
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 px-4 md:px-8">
      <SidebarTrigger className="rounded-xl glass h-10 w-10" />

      <div className="hidden md:block flex-1">
        <h2 className="font-display text-lg font-semibold leading-tight">Hi, Patryk</h2>
        <p className="text-xs text-muted-foreground">Welcome home — everything is calm.</p>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden md:flex items-center gap-2 glass rounded-full pl-4 pr-2 py-1.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            placeholder="Search devices, scenes…"
            className="bg-transparent outline-none text-sm w-56 placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center gap-2 glass rounded-full px-3 py-2">
          <span className={`text-xs font-medium ${home ? "text-foreground" : "text-muted-foreground"}`}>
            Home
          </span>
          <Switch checked={!home} onCheckedChange={(v) => setHome(!v)} />
          <span className={`text-xs font-medium ${!home ? "text-foreground" : "text-muted-foreground"}`}>
            Away
          </span>
        </div>

        <button className="relative h-10 w-10 rounded-full glass flex items-center justify-center">
          <Bell className="h-4 w-4" />
          <span className="absolute top-2.5 right-2.5 h-1.5 w-1.5 rounded-full bg-accent" />
        </button>
      </div>
    </header>
  );
}
