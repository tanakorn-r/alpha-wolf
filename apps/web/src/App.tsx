import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { StockDetailDrawer } from "./features/stock-detail/StockDetailDrawer";
import { DashboardPage } from "./pages/DashboardPage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { IncomeCalendarPage } from "./pages/IncomeCalendarPage";

export default function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/scanner" element={<DiscoverPage />} />
        <Route path="/calendar" element={<IncomeCalendarPage />} />
        <Route path="/discover" element={<Navigate to="/scanner" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <StockDetailDrawer />
    </AppLayout>
  );
}
