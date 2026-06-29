import { Navigate, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "./components/layout/AppLayout";
import { DeepAnalysisPanel } from "./components/DeepAnalysisPanel";
import { StockDetailDrawer } from "./features/stock-detail/StockDetailDrawer";
import { DashboardPage } from "./pages/DashboardPage";
import { DayTraderPage } from "./pages/DayTraderPage";
import { DeepAiPage } from "./pages/DeepAiPage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { IncomeCalendarPage } from "./pages/IncomeCalendarPage";
import { ensureMarketCatalog } from "./lib/api";

export default function App() {
  useQuery({ queryKey: ["market-catalog"], queryFn: ensureMarketCatalog, staleTime: 86_400_000 });
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/scanner" element={<DiscoverPage />} />
        <Route path="/deep-ai" element={<DeepAiPage />} />
        <Route path="/day-trader" element={<DayTraderPage />} />
        <Route path="/calendar" element={<IncomeCalendarPage />} />
        <Route path="/discover" element={<Navigate to="/scanner" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <StockDetailDrawer />
      <DeepAnalysisPanel />
    </AppLayout>
  );
}
