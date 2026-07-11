import { Capacitor } from "@capacitor/core";
import { useEffect, useState } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "./components/layout/AppLayout";
import { DeepAnalysisPanel } from "./components/DeepAnalysisPanel";
import { StockDetailDrawer } from "./features/stock-detail/StockDetailDrawer";
import { DashboardPage } from "./pages/DashboardPage";
import { LandingPage } from "./pages/LandingPage";
import { StockHuntPage } from "./pages/StockHuntPage";
import { HuntAiPage } from "./pages/HuntAiPage";
import { DividendHuntPage } from "./pages/DividendHuntPage";
import { LiveTradePage } from "./pages/LiveTradePage";
import { ensureMarketCatalog, loadAuthUser } from "./lib/api";

const VISITED_STORAGE_KEY = "aw_visited_app";

// Native (Capacitor) users already installed the app to use it — never show marketing there.
// On web, a brand-new anonymous visitor sees the landing page once; anyone signed in, or who has
// already been through the app once on this device, goes straight to the Dashboard like before.
function useShowLanding(): boolean {
  const native = Capacitor.isNativePlatform();
  const [visited, setVisited] = useState(() => typeof window !== "undefined" && window.localStorage.getItem(VISITED_STORAGE_KEY) === "1");
  const authQuery = useQuery({ queryKey: ["auth-user"], queryFn: loadAuthUser, staleTime: 300_000, retry: 0 });
  const signedIn = Boolean(authQuery.data);

  // Only lock in "visited" once we KNOW they qualify to skip landing (native shell or a
  // confirmed session) — never while auth is still resolving, or every fresh anonymous visitor
  // would get marked visited during that brief pending window before we even knew they were a
  // guest, and would never see the landing page again.
  useEffect(() => {
    if ((native || signedIn) && !visited && typeof window !== "undefined") {
      window.localStorage.setItem(VISITED_STORAGE_KEY, "1");
      setVisited(true);
    }
  }, [native, signedIn, visited]);

  if (native || visited) return false;
  if (authQuery.isPending) return false;
  return !signedIn;
}

function HomeRoute() {
  const showLanding = useShowLanding();
  const [entered, setEntered] = useState(false);
  if (showLanding && !entered) {
    return (
      <LandingPage
        onEnter={() => {
          if (typeof window !== "undefined") window.localStorage.setItem(VISITED_STORAGE_KEY, "1");
          setEntered(true);
        }}
      />
    );
  }
  return (
    <AppLayout>
      <DashboardPage />
      <StockDetailDrawer />
      <DeepAnalysisPanel />
    </AppLayout>
  );
}

function AppShell() {
  return (
    <AppLayout>
      <Outlet />
      <StockDetailDrawer />
      <DeepAnalysisPanel />
    </AppLayout>
  );
}

export default function App() {
  useQuery({ queryKey: ["market-catalog"], queryFn: ensureMarketCatalog, staleTime: 86_400_000 });
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route element={<AppShell />}>
        <Route path="/daily-brief" element={<Navigate to="/hunt-ai?tab=brief" replace />} />
        <Route path="/live-trade" element={<LiveTradePage />} />
        <Route path="/scanner" element={<StockHuntPage />} />
        <Route path="/deep-ai" element={<Navigate to="/hunt-ai" replace />} />
        <Route path="/hunt-ai" element={<HuntAiPage />} />
        <Route path="/day-trader" element={<Navigate to="/hunt-ai" replace />} />
        <Route path="/calendar" element={<DividendHuntPage />} />
        <Route path="/discover" element={<Navigate to="/scanner" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
