import { PortfolioReviewCard } from "../../components/PortfolioReviewCard";
import { PremiumAiButton } from "../../components/PremiumAiButton";
import { agentLoadingTitle, PremiumLoading } from "../hunt-ai/ui";
import type { Dashboard } from "./useDashboard";

export function AiAdvisor({ dash }: { dash: Dashboard }) {
  return (
    <>
      {dash.hasHoldings && !dash.analysis && !dash.analyzing ? (
        <section className="flex items-center justify-between gap-4 rounded-[var(--aw-radius-card)] border border-[#285f48] bg-[#161619] p-4 max-[680px]:flex-col max-[680px]:items-stretch">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[.14em] text-[#3ecf8e]">AI · on demand</div>
            <h2 className="mt-1 text-[16px] font-semibold">Need a second opinion on this month?</h2>
            <p className="mt-1 text-[12px] text-[#8c8c95]">Your active Agent grades concentration, P/L, yield, and next actions from live portfolio data.</p>
          </div>
          <PremiumAiButton label={dash.analyzing ? "Analyzing" : "Review portfolio"} sublabel="Portfolio AI" disabled={!dash.hasHoldings || dash.analyzing} loading={dash.analyzing} onClick={() => void dash.askAi(false)} size="compact" />
        </section>
      ) : null}
      {dash.analyzing ? <PremiumLoading title={agentLoadingTitle(dash.activeAgentId, "portfolio")} subject="AI" agentId={dash.activeAgentId} task="portfolio" /> : null}
      {!dash.analyzing && dash.analysis ? <PortfolioReviewCard review={dash.analysis} onRerun={() => void dash.askAi(true)} /> : null}
    </>
  );
}
