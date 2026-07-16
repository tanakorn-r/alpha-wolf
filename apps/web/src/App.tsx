import { Capacitor } from "@capacitor/core";
import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { LandingPage } from "./pages/LandingPage";
import { PrivacyPage, RefundPage, SupportPage, TermsPage } from "./pages/LegalPages";
import { loadAppBootstrap, loadAuthUser } from "./lib/api";
import { LocaleGate } from "./components/settings/LocalePreferences";
import { OperationalTelemetry } from "./components/telemetry/OperationalTelemetry";
import { trackEvent } from "./lib/telemetry";

const AppLayout = lazy(() => import("./components/layout/AppLayout").then((module) => ({ default: module.AppLayout })));
const DeepAnalysisPanel = lazy(() => import("./components/DeepAnalysisPanel").then((module) => ({ default: module.DeepAnalysisPanel })));
const StockDetailDrawer = lazy(() => import("./features/stock-detail/StockDetailDrawer").then((module) => ({ default: module.StockDetailDrawer })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const StockHuntPage = lazy(() => import("./pages/StockHuntPage").then((module) => ({ default: module.StockHuntPage })));
const HuntAiPage = lazy(() => import("./pages/HuntAiPage").then((module) => ({ default: module.HuntAiPage })));
const DividendHuntPage = lazy(() => import("./pages/DividendHuntPage").then((module) => ({ default: module.DividendHuntPage })));
const LiveTradePage = lazy(() => import("./pages/LiveTradePage").then((module) => ({ default: module.LiveTradePage })));

const VISITED_STORAGE_KEY = "aw_visited_app";

// Native (Capacitor) users already installed the app to use it — never show marketing there.
// On web, a brand-new anonymous visitor sees the landing page once; anyone signed in, or who has
// already been through the app once on this device, goes straight to the Dashboard like before.
type HomeDestination = "landing" | "app";

function AppLoading() {
  return <div className="grid min-h-screen place-items-center bg-[#0e0e10] text-[#3ecf8e]" role="status" aria-label="Loading Alpha Wolf"><LoadingSpinner size={22} /></div>;
}

function useHomeDestination(): HomeDestination {
  const native = Capacitor.isNativePlatform();
  const [visited, setVisited] = useState(() => typeof window !== "undefined" && window.localStorage.getItem(VISITED_STORAGE_KEY) === "1");
  const authQuery = useQuery({
    queryKey: ["auth-user"],
    queryFn: loadAuthUser,
    staleTime: 300_000,
    retry: 0,
    placeholderData: null,
  });
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

  // Session restoration is background hydration, never a reason to block the whole shell.
  // Existing visitors can enter immediately; a new signed-in visitor moves from the landing
  // page to the app as soon as the session response arrives.
  if (native) return "app";
  if (visited || signedIn) return "app";
  return "landing";
}

function HomeRoute() {
  const destination = useHomeDestination();
  const [entered, setEntered] = useState(false);
  if (destination === "landing" && !entered) {
    return (
      <LandingPage
        onEnter={() => {
          if (typeof window !== "undefined") window.localStorage.setItem(VISITED_STORAGE_KEY, "1");
          trackEvent("success_dashboard_opened");
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

function BootstrapGate() {
  const queryClient = useQueryClient();
  useQuery({
    queryKey: ["app-bootstrap"],
    queryFn: async () => {
      const data = await loadAppBootstrap();
      // Hydrate the existing feature-level keys before their components mount. This keeps
      // account UI unchanged while removing four production network round trips at startup.
      queryClient.setQueryData(["auth-user"], data.user);
      queryClient.setQueryData(["agents"], data.agents);
      queryClient.setQueryData(["notifications"], data.notifications);
      if (data.user?.id) queryClient.setQueryData(["portfolio-watchlist", `user:${data.user.id}`], data.watchlist);
      return data;
    },
    staleTime: 300_000,
    retry: 0,
  });

  // Bootstrap is only a round-trip optimization. Feature queries remain the source-of-truth
  // fallback, so a slow or failed aggregate response must never blank the application.
  return <Outlet />;
}

export default function App() {
  return (
    <>
      <OperationalTelemetry />
      <Suspense fallback={<AppLoading />}>
        <Routes>
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/refunds" element={<RefundPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route element={<BootstrapGate />}>
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
        </Route>
        </Routes>
      </Suspense>
    </>
  );
}
