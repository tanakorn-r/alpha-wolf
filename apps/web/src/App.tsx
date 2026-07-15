import { Capacitor } from "@capacitor/core";
import { useEffect, useState } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "./components/layout/AppLayout";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { DeepAnalysisPanel } from "./components/DeepAnalysisPanel";
import { StockDetailDrawer } from "./features/stock-detail/StockDetailDrawer";
import { DashboardPage } from "./pages/DashboardPage";
import { LandingPage } from "./pages/LandingPage";
import { StockHuntPage } from "./pages/StockHuntPage";
import { HuntAiPage } from "./pages/HuntAiPage";
import { DividendHuntPage } from "./pages/DividendHuntPage";
import { LiveTradePage } from "./pages/LiveTradePage";
import { PrivacyPage, RefundPage, SupportPage, TermsPage } from "./pages/LegalPages";
import { ensureMarketCatalog, loadAuthUser } from "./lib/api";
import { LocaleGate } from "./components/settings/LocalePreferences";

const VISITED_STORAGE_KEY = "aw_visited_app";

// Native (Capacitor) users already installed the app to use it — never show marketing there.
// On web, a brand-new anonymous visitor sees the landing page once; anyone signed in, or who has
// already been through the app once on this device, goes straight to the Dashboard like before.
type HomeDestination = "pending" | "landing" | "app";

function useHomeDestination(): HomeDestination {
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

  // Native never needs the auth round-trip to decide. On web, always wait for auth to resolve
  // before mounting the Dashboard — jumping straight there on a stale "visited" flag (before we
  // know the session is still valid) is what caused the visible skeleton-then-content blink on
  // every hard refresh, since Dashboard's own skeleton is a different shape from its real layout.
  if (native) return "app";
  if (authQuery.isPending) return "pending";
  if (visited || signedIn) return "app";
  return "landing";
}

function HomeRoute() {
  const destination = useHomeDestination();
  const [entered, setEntered] = useState(false);
  if (destination === "pending") {
    return (
      <div className="grid min-h-screen place-items-center bg-[#0e0e10] text-[#3ecf8e]" role="status" aria-label="Loading Alpha Wolf">
        <LoadingSpinner size={22} />
      </div>
    );
  }
  if (destination === "landing" && !entered) {
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
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/refunds" element={<RefundPage />} />
      <Route path="/support" element={<SupportPage />} />
      <Route path="/" element={<LocaleGate><HomeRoute /></LocaleGate>} />
      <Route element={<LocaleGate><AppShell /></LocaleGate>}>
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
