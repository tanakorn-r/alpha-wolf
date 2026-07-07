import { AiVerdictCard } from "../../components/AiVerdictCard";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import type { Dashboard } from "./useDashboard";

export function AiAdvisor({ dash }: { dash: Dashboard }) {
  return (
    <>
      {dash.hasHoldings ? (
        <section className="flex items-center justify-between gap-5 rounded-xl border border-[#285f48] bg-[#161619] p-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[.14em] text-[#3ecf8e]">AI · on demand</div>
            <h2 className="mt-1 text-lg font-semibold">Need a second opinion on this month?</h2>
            <p className="mt-1 text-sm text-[#8c8c95]">AI runs only after you ask and uses live technicals and fundamentals.</p>
          </div>
          <button
            type="button"
            disabled={!dash.hasHoldings || dash.analyzing}
            onClick={() => void dash.askAi()}
            className="flex items-center gap-2 rounded-lg bg-[#3ecf8e] px-5 py-3 text-sm font-bold text-[#06120c] disabled:opacity-40"
          >
            {dash.analyzing ? <LoadingSpinner size={14} /> : null}
            {dash.analyzing ? "Analyzing…" : "Suggest my next move"}
          </button>
        </section>
      ) : null}
      {dash.analyzing ? (
        <div className="flex items-center justify-center gap-3.5 rounded-xl border border-[#2a2a31] bg-[#141417] p-[34px] text-[#8c8c95]">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#2a2a31] border-t-[#3ecf8e]" />
          Analyzing your portfolio…
        </div>
      ) : null}
      {dash.analysis ? <AiVerdictCard value={dash.analysis} onRerun={() => void dash.askAi()} size="modal" /> : null}
    </>
  );
}
