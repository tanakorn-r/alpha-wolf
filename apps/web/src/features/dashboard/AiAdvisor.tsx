import { PortfolioReviewCard } from "../../components/PortfolioReviewCard";
import { PremiumAiButton } from "../../components/PremiumAiButton";
import { agentLoadingTitle, PremiumLoading } from "../hunt-ai/ui";
import type { Dashboard } from "./useDashboard";

export function AiAdvisor({ dash }: { dash: Dashboard }) {
  return (
    <>
      {dash.hasHoldings ? (
        <section className="flex items-center justify-between gap-5 rounded-xl border border-[#285f48] bg-[#161619] p-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[.14em] text-[#3ecf8e]">AI · on demand</div>
            <h2 className="mt-1 text-lg font-semibold">Need a second opinion on this month?</h2>
            <p className="mt-1 text-sm text-[#8c8c95]">Your active Agent grades concentration, P/L, yield, and next actions from live portfolio data.</p>
          </div>
          <PremiumAiButton label={dash.analyzing ? "Analyzing" : "Review portfolio"} sublabel="Portfolio AI" disabled={!dash.hasHoldings || dash.analyzing} loading={dash.analyzing} onClick={() => void dash.askAi()} size="compact" />
        </section>
      ) : null}
      {dash.analyzing ? <PremiumLoading title={agentLoadingTitle(dash.activeAgentId, "portfolio")} subject="AI" agentId={dash.activeAgentId} task="portfolio" /> : null}
      {dash.analysis ? <PortfolioReviewCard review={dash.analysis} onRerun={() => void dash.askAi()} /> : null}
    </>
  );
}
