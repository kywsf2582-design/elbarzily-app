import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import PresenceHeartbeat from "./components/PresenceHeartbeat";
import PushNotifications from "./features/push/PushNotifications";
import { ThemeProvider } from "./contexts/ThemeContext";

const Home = lazy(() => import("./pages/Home"));
const PlayersPage = lazy(() => import("./pages/PlayersPage"));

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system" switchable>
        <TooltipProvider>
          <Toaster position="top-center" />
          <PresenceHeartbeat />
          <PushNotifications />
          <Suspense fallback={<div dir="rtl" role="status" style={{ minHeight: "25vh", display: "grid", placeItems: "center" }}>جارٍ تحميل التطبيق…</div>}>
            <Switch>
              <Route path="/404" component={NotFound} />
              <Route path="/players/:playerId" component={PlayersPage} />
              <Route path="/players" component={PlayersPage} />
              <Route path="/" component={Home} />
              <Route component={Home} />
            </Switch>
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
