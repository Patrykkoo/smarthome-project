import { LayoutDashboard, Lightbulb, BarChart3, Sparkles, Settings as SettingsIcon, Home } from "lucide-react";
import { NavLink } from "./NavLink";
import { useState, useEffect } from "react";
import { auth, User as AuthUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Devices & Rooms", url: "/devices", icon: Lightbulb },
  { title: "Energy Overview", url: "/energy", icon: BarChart3 },
  { title: "Scenes & Automations", url: "/scenes", icon: Sparkles },
];

export function AppSidebar() {
  const { state, setOpen, isMobile } = useSidebar();

  const collapsed = state === "collapsed" && !isMobile;
  
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(auth.getCurrentUser());

  useEffect(() => {
    const handleAuthChange = () => setCurrentUser(auth.getCurrentUser());
    window.addEventListener('auth_changed', handleAuthChange);
    window.addEventListener('user_settings_changed', handleAuthChange);
    return () => {
      window.removeEventListener('auth_changed', handleAuthChange);
      window.removeEventListener('user_settings_changed', handleAuthChange);
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1280px)');
    
    const handleMediaChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) {
        setOpen(false); 
      } else {
        setOpen(true);  
      }
    };

    handleMediaChange(mediaQuery);
    mediaQuery.addEventListener('change', handleMediaChange);
    return () => mediaQuery.removeEventListener('change', handleMediaChange);
  }, [setOpen]);

  return (
    <Sidebar 
      collapsible="icon" 
      className={cn(
        "border-r border-border/30 transition-[margin] duration-200 ease-linear",
        !isMobile && "data-[state=collapsed]:mr-6"
      )}
      style={{ 
        "--sidebar-width": "16rem",
        "--sidebar-width-icon": "4.5rem" 
      } as React.CSSProperties}
    >
      <SidebarHeader className={cn("py-6 transition-all", collapsed ? "px-0 flex items-center justify-center" : "px-4")}>
        <NavLink to="/" className={cn("flex items-center outline-none w-full", collapsed ? "justify-center" : "gap-3")}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
            <Home className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight overflow-hidden">
              <span className="font-display text-base font-semibold tracking-tight whitespace-nowrap">Smartify</span>
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">Smart home</span>
            </div>
          )}
        </NavLink>
      </SidebarHeader>

      <SidebarContent className={cn("transition-all", collapsed ? "px-0 mt-2" : "px-2 mt-0")}>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="w-full flex flex-col gap-2">
              {items.map((item) => (
                <SidebarMenuItem key={item.title} className="w-full">
                  <SidebarMenuButton 
                    asChild 
                    tooltip={item.title} 
                    className={cn("rounded-2xl transition-all", collapsed ? "!h-10 !w-10 flex items-center justify-center mx-auto bg-muted/60 hover:bg-muted shadow-sm" : "!h-14 w-full p-0 !bg-transparent hover:!bg-transparent")}
                  >
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className={cn(
                        "flex items-center text-sm font-medium text-foreground/70 active:scale-95 transition-transform outline-none w-full h-full rounded-2xl",
                        collapsed ? "justify-center" : "gap-3 px-3 hover:bg-muted/30"
                      )}
                      activeClassName="!bg-primary !text-primary-foreground shadow-md hover:!bg-primary"
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      {!collapsed && <span className="whitespace-nowrap">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className={cn("transition-all", collapsed ? "px-0 pb-6 flex flex-col items-center gap-4" : "p-4 pb-6")}>
        <SidebarMenu className="w-full">
          <SidebarMenuItem className="w-full">
            <SidebarMenuButton 
              asChild 
              tooltip="Settings" 
              className={cn("rounded-2xl transition-all", collapsed ? "!h-10 !w-10 flex items-center justify-center mx-auto bg-muted/60 hover:bg-muted shadow-sm" : "!h-14 w-full p-0 !bg-transparent hover:!bg-transparent")}
            >
              <NavLink
                to="/settings"
                className={cn(
                  "flex items-center text-sm font-medium text-foreground/70 active:scale-95 transition-transform outline-none w-full h-full rounded-2xl",
                  collapsed ? "justify-center" : "gap-3 px-3 hover:bg-muted/30"
                )}
                activeClassName="!bg-primary !text-primary-foreground shadow-md hover:!bg-primary"
              >
                <SettingsIcon className="h-5 w-5 shrink-0" />
                {!collapsed && <span className="whitespace-nowrap">Settings</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {currentUser && (
          <div className={cn(
            "flex items-center transition-all",
            collapsed ? "justify-center w-full" : "mt-2 gap-3 rounded-2xl bg-muted/40 p-3 w-full border border-border/50"
          )}>
            <div className={cn(
              "flex shrink-0 items-center justify-center bg-primary/10 overflow-hidden font-display font-semibold uppercase text-primary border border-primary/20 shadow-sm transition-all", 
              collapsed ? "h-12 w-12 rounded-[14px] text-lg" : "h-10 w-10 rounded-xl text-base"
            )}>
              {currentUser.avatar ? (
                <img src={currentUser.avatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                currentUser.username.charAt(0)
              )}
            </div>
            {!collapsed && (
              <div className="flex-1 leading-tight min-w-0">
                <p className="text-sm font-semibold text-foreground whitespace-nowrap">{currentUser.username}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">{currentUser.role === 'owner' ? 'Owner' : 'Member'}</p>
              </div>
            )}
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}