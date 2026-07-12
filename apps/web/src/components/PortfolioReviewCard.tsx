import { AgentCall } from "./agents/AgentCall";
import type { PortfolioReviewResponse } from "../lib/api";

export function PortfolioReviewCard({ review, onRerun }: { review: PortfolioReviewResponse; onRerun: () => void }) {
  const color = review.agent.color;
  return (
    <AgentCall agent={review.agent} label={review.agent.title} bylineDetail="Reviewed your portfolio just now" score={review.score} scoreLabel="portfolio score" signal={review.verdict} headline={portfolioHeadline(review.score)} summary={review.intro} bullets={review.bullets} accent={color} signoff={false} density="compact">
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3" style={{ borderColor: `${color}30` }}>
        <span className="font-mono text-[9.5px] text-[#5a5a62]">AI-generated on request · not financial advice</span>
        <button type="button" onClick={onRerun} className="rounded-[var(--aw-radius-control)] border px-3 py-1.5 text-[10.5px] font-bold" style={{ borderColor: `${color}66`, color, background: `${color}12` }}>Re-run review</button>
      </div>
    </AgentCall>
  );
}

function portfolioHeadline(score: number) {
  if (score >= 75) return "Your portfolio still owns quality";
  if (score >= 55) return "Your portfolio has a workable foundation";
  return "Your portfolio needs a tighter plan";
}
