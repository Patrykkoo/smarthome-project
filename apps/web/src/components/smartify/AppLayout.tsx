import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Topbar } from "./Topbar";
import { useSceneWatcher } from "@/hooks/use-scene-watcher";

export function AppLayout() {
  useSceneWatcher();

  return (
    <SidebarProvider>
      <div className="h-screen flex w-full bg-background ambient-bg overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 h-screen">
          <Topbar />
          <main className="flex-1 min-h-0 overflow-y-auto px-4 md:px-8 pb-10 animate-fade-in">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}