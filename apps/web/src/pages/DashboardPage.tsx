import { ErrorBanner } from "../components/ui/panels";
import { SectionHeading } from "../components/ui/Surface";
import { GoogleAccount, GoogleAccountModal } from "../components/auth/GoogleAccount";
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
import { TransactionHistory } from "../features/dashboard/TransactionHistory";
import { useDashboard } from "../features/dashboard/useDashboard";

export function DashboardPage() {
  const dash = useDashboard();

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-[14px] text-[#ececee]">
      <div className="flex items-start justify-between gap-3">
        <SectionHeading title="Strategy Dashboard" body="Everything happening with your money, in one view" />
        <GoogleAccount />
      </div>
      {dash.signInOpen ? <GoogleAccountModal user={dash.accountUser} onClose={dash.closeSignIn} /> : null}
      {dash.portfolio?.fxRates.THB ? (
        <div className={`rounded-[9px] border px-3 py-2 font-mono text-[10.5px] ${dash.portfolio.fxStale ? "border-[#f5c451]/35 bg-[#f5c451]/8 text-[#f5c451]" : "border-[#2a2a31] bg-[#121214] text-[#6f6f78]"}`}>
          Main currency {dash.portfolio.reportingCurrency} · USD/THB {dash.portfolio.fxRates.THB.toFixed(4)} · {dash.portfolio.fxSource ?? "FX cache"}{dash.portfolio.fxFetchedAt ? ` · updated ${new Date(dash.portfolio.fxFetchedAt).toLocaleString()}` : ""}{dash.portfolio.fxStale ? " · stale fallback—live refresh unavailable" : ""}
        </div>
      ) : null}
      {dash.isSkeleton ? <DashboardSkeleton /> : (
        <>
          {dash.isError || dash.actionError ? (
            <ErrorBanner message={dash.actionError || "Portfolio service is unavailable."} busy={dash.isFetching} onRetry={dash.refresh} />
          ) : null}

          {dash.showEmptyHero ? (
            <EmptyPortfolio onAdd={dash.holdingForm.show} />
          ) : (
            <>
              <AiAdvisor dash={dash} />
              <StatsRow dash={dash} />
              <PortfolioValueCard dash={dash} />
              {dash.hasHoldings ? <ChartsRow dash={dash} /> : null}
            </>
          )}

          {dash.hasHoldings || dash.hasIncome ? (
            <section className={`grid items-start gap-[14px] ${dash.hasHoldings && dash.hasIncome ? "min-[980px]:grid-cols-[1.35fr_.95fr]" : "grid-cols-1"}`}>
              {dash.hasHoldings ? <HoldingsTable dash={dash} /> : null}
              {dash.hasIncome ? <IncomeList dash={dash} /> : null}
            </section>
          ) : null}
          {dash.portfolio?.transactions.length ? <TransactionHistory dash={dash} /> : null}
          {dash.showEmptyHero ? <AiAdvisor dash={dash} /> : null}

          {dash.holdingForm.open ? <HoldingFormModal dash={dash} /> : null}
          <SellModal dash={dash} />
        </>
      )}
    </div>
  );
}
