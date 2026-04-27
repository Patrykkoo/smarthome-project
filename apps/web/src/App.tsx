import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/livora/AppLayout";
import Index from "./pages/Index";
import Devices from "./pages/Devices";
import Energy from "./pages/Energy";
import Scenes from "./pages/Scenes";
import NotFound from "./pages/NotFound";
import { useWebSockets } from "./hooks/use-websockets";

const queryClient = new QueryClient();

// Komponent uruchamiający nasze WebSockety i trzymający routing
const SmartHomeRoot = () => {
  useWebSockets();

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Index />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/energy" element={<Energy />} />
          <Route path="/scenes" element={<Scenes />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
};

// Główny komponent aplikacji
const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <SmartHomeRoot />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;