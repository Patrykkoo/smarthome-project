import { LayoutDashboard, Lightbulb, BarChart3, Sparkles, Settings, Home } from "lucide-react";
import { NavLink } from "@/components/NavLink";
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
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="px-4 py-5">
        <NavLink to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Home className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="font-display text-base font-semibold tracking-tight">Smartify</span>
              <span className="text-[11px] text-muted-foreground">Smart home</span>
            </div>
          )}
        </NavLink>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild className="h-11 rounded-2xl">
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="flex items-center gap-3 px-3 text-sm font-medium text-foreground/70 hover:text-foreground"
                      activeClassName="!bg-primary !text-primary-foreground hover:!text-primary-foreground"
                    >
                      <item.icon className="h-[18px] w-[18px]" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="h-11 rounded-2xl">
              <NavLink
                to="/settings"
                className="flex items-center gap-3 px-3 text-sm font-medium text-foreground/70 hover:text-foreground"
                activeClassName="!bg-primary !text-primary-foreground"
              >
                <Settings className="h-[18px] w-[18px]" />
                {!collapsed && <span>Settings</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {!collapsed && (
          <div className="mt-2 flex items-center gap-3 rounded-2xl glass p-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/40 font-display text-sm font-semibold">
              P
            </div>
            <div className="flex-1 leading-tight">
              <p className="text-sm font-semibold text-foreground">Patryk</p>
              <p className="text-xs text-muted-foreground">Owner</p>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
