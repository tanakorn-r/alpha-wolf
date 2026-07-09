import { AgentByline, AgentSignoff } from "../../components/agents/AgentByline";
import { PremiumAiButton } from "../../components/PremiumAiButton";
import type { PortfolioReviewResponse } from "../../lib/api";
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

function PortfolioReviewCard({ review, onRerun }: { review: PortfolioReviewResponse; onRerun: () => void }) {
  const color = review.agent.color;
  return (
    <section className="rounded-[14px] border bg-[#161619] p-5" style={{ borderColor: `${color}55` }}>
      <AgentByline agent={review.agent} label="Portfolio agent" />
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex h-[92px] w-[92px] flex-none flex-col items-center justify-center rounded-[18px] border bg-[#0e0e10]" style={{ borderColor: `${color}66` }}>
          <div className="font-mono text-[34px] font-extrabold leading-none" style={{ color }}>{review.score}</div>
          <div className="mt-1 text-[9px] uppercase tracking-[0.08em] text-[#8c8c95]">score</div>
        </div>
        <div className="min-w-[240px] flex-1">
          <div className="inline-flex rounded-[7px] border px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.06em]" style={{ borderColor: `${color}66`, color }}>
            {review.verdict}
          </div>
          <p className="mt-3 text-[13.5px] leading-[1.65] text-[#cfcfd4]">{review.intro}</p>
        </div>
        <PremiumAiButton label="Re-run" sublabel="Portfolio" onClick={onRerun} size="xs" />
      </div>

      <div className="mt-5 grid gap-3 min-[820px]:grid-cols-3">
        {review.sections.map((section) => (
          <div key={section.h} className="rounded-[11px] border border-[#2a2a31] bg-[#0e0e10] p-4">
            <div className="text-[12px] font-bold text-[#ececee]">{section.h}</div>
            <p className="mt-2 text-[12.5px] leading-[1.6] text-[#8c8c95]">{section.b}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-2">
        {review.bullets.map((bullet, index) => (
          <div key={index} className="flex gap-2.5 text-[13px] leading-[1.55] text-[#cfcfd4]">
            <span style={{ color }}>●</span>
            <span>{bullet}</span>
          </div>
        ))}
      </div>
      <AgentSignoff agent={review.agent} text={review.sign} />
    </section>
  );
}
