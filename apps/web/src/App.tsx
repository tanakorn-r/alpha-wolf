import { Navigate, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "./components/layout/AppLayout";
import { DeepAnalysisPanel } from "./components/DeepAnalysisPanel";
import { StockDetailDrawer } from "./features/stock-detail/StockDetailDrawer";
import { DashboardPage } from "./pages/DashboardPage";
import { DailyBriefPage } from "./pages/DailyBriefPage";
import { StockHuntPage } from "./pages/StockHuntPage";
import { HuntAiPage } from "./pages/HuntAiPage";
import { DividendHuntPage } from "./pages/DividendHuntPage";
import { LiveTradePage } from "./pages/LiveTradePage";
import { ensureMarketCatalog } from "./lib/api";

export default function App() {
  useQuery({ queryKey: ["market-catalog"], queryFn: ensureMarketCatalog, staleTime: 86_400_000 });
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/daily-brief" element={<DailyBriefPage />} />
        <Route path="/live-trade" element={<LiveTradePage />} />
        <Route path="/scanner" element={<StockHuntPage />} />
        <Route path="/deep-ai" element={<Navigate to="/hunt-ai" replace />} />
        <Route path="/hunt-ai" element={<HuntAiPage />} />
        <Route path="/day-trader" element={<Navigate to="/hunt-ai" replace />} />

        <Route path="/calendar" element={<DividendHuntPage />} />
        <Route path="/discover" element={<Navigate to="/scanner" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <StockDetailDrawer />
      <DeepAnalysisPanel />
    </AppLayout>
  );
}
