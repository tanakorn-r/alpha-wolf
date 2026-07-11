import { ErrorBanner } from "../components/ui/panels";
import { AiAdvisor } from "../features/dashboard/AiAdvisor";
import { ChartsRow } from "../features/dashboard/ChartsRow";
import { DashboardSkeleton } from "../features/dashboard/DashboardSkeleton";
import { EmptyPortfolio } from "../features/dashboard/EmptyPortfolio";
import { HoldingFormModal } from "../features/dashboard/HoldingFormModal";
import { HoldingsTable } from "../features/dashboard/HoldingsTable";
import { IncomeList } from "../features/dashboard/IncomeList";
import { PortfolioValueCard } from "../features/dashboard/PortfolioValueCard";
import { SellModal } from "../features/dashboard/SellModal";
import { StatsRow } from "../features/dashboard/StatsRow";
import { useDashboard } from "../features/dashboard/useDashboard";

export function DashboardPage() {
  const dash = useDashboard();

  if (dash.isSkeleton) return <DashboardSkeleton />;

  return (
    <div className="flex flex-col gap-5 text-[#ececee]">
      {dash.isError || dash.actionError ? (
        <ErrorBanner message={dash.actionError || "Portfolio service is unavailable."} busy={dash.isFetching} onRetry={dash.refresh} />
      ) : null}

      {dash.showEmptyHero ? (
        <EmptyPortfolio onAdd={dash.holdingForm.show} />
      ) : (
        <>
          <StatsRow dash={dash} />
          <PortfolioValueCard dash={dash} />
          {dash.hasHoldings ? <ChartsRow dash={dash} /> : null}
        </>
      )}

      {dash.hasHoldings || dash.hasIncome ? (
        <section className={`grid gap-[14px] ${dash.hasHoldings && dash.hasIncome ? "xl:grid-cols-[1fr_320px]" : "xl:grid-cols-1"}`}>
          {dash.hasHoldings ? <HoldingsTable dash={dash} /> : null}
          {dash.hasIncome ? <IncomeList dash={dash} /> : null}
        </section>
      ) : null}

      <AiAdvisor dash={dash} />

      {dash.holdingForm.open ? <HoldingFormModal dash={dash} /> : null}
      <SellModal dash={dash} />
    </div>
  );
}
