import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { StockDetailDrawer } from "./features/stock-detail/StockDetailDrawer";
import { DashboardPage } from "./pages/DashboardPage";
import { DiscoverPage } from "./pages/DiscoverPage";

export default function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/discover" element={<DiscoverPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <StockDetailDrawer />
    </AppLayout>
  );
}
