import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/smartify/AppLayout";
import { useWebSockets } from "./hooks/use-websockets";
import { auth } from "./lib/auth";
import { ThemeProvider } from "./hooks/use-theme";

import { LockScreen } from "./components/smartify/LockScreen";
import Index from "./pages/Index";
import Devices from "./pages/Devices";
import Energy from "./pages/Energy";
import Scenes from "./pages/Scenes";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";

const queryClient = new QueryClient();

// Układ zawierający ekran domowy ORAZ nasłuchiwanie na blokadę ekranu (Away mode)
const ProtectedLayout = () => {
  const user = auth.getCurrentUser();
  if (!user) return <Navigate to="/login" replace />;
  
  return (
    <>
      <LockScreen />
      <AppLayout />
    </>
  );
};

const SmartHomeRoot = () => {
  useWebSockets();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Trasy chronione dla tabletu */}
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<Index />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/energy" element={<Energy />} />
          <Route path="/scenes" element={<Scenes />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="system" storageKey="smartify_theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <SmartHomeRoot />
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;