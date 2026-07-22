import type { CSSProperties, ReactNode } from "react";
import type { HuntTab } from "./lib";

type ResultMode = Extract<HuntTab, "signals" | "analyst" | "history" | "timing" | "technical">;

const reportMeta: Record<ResultMode, { number: string; title: string; purpose: string; accent: string; sections: string[] }> = {
  signals: { number: "01", title: "Quick verdict", purpose: "Decision first, then the evidence controlling it.", accent: "#3ecf8e", sections: ["Action", "Price context", "Evidence"] },
  analyst: { number: "02", title: "Deep analysis", purpose: "A source-backed investment memo with explicit decision rules.", accent: "#78a7ff", sections: ["Thesis", "Dissent", "Change triggers"] },
  history: { number: "03", title: "Historical analysis", purpose: "The causal story behind price, earnings, and regime shifts.", accent: "#c5a4ff", sections: ["Regimes", "Turning points", "Forward bridge"] },
  timing: { number: "04", title: "Buy timing", purpose: "A capital-deployment plan, not a single price prediction.", accent: "#65e7ad", sections: ["Sizing", "Calendar", "Validation"] },
  technical: { number: "05", title: "Chart read", purpose: "Market structure, framework agreement, and invalidation.", accent: "#4fc9ba", sections: ["Structure", "Frameworks", "Risk levels"] },
};

export function ResultExperience({ mode, children }: { mode: ResultMode; children: ReactNode }) {
  const meta = reportMeta[mode];
  const style = { "--report-accent": meta.accent } as CSSProperties;
  return (
    <div className={`aw-report aw-report-${mode} min-w-0`} data-report-mode={mode} style={style}>
      <header className="aw-report-guide mb-2.5 overflow-hidden rounded-[12px] border border-white/[0.07] bg-[#0e0f11]">
        <div className="grid min-w-0 gap-3 px-3.5 py-3 min-[680px]:grid-cols-[minmax(0,1fr)_auto] min-[680px]:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <span className="font-mono text-[9px] font-black tracking-[0.12em] text-[var(--report-accent)]">{meta.number}</span>
            <div className="min-w-0">
              <div className="text-[11px] font-extrabold text-[#e5e5e8]">{meta.title}</div>
              <p className="mt-0.5 text-[9.5px] leading-[1.4] text-[#707078]">{meta.purpose}</p>
            </div>
          </div>
          <ol className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label={`${meta.title} reading order`}>
            {meta.sections.map((section, index) => (
              <li key={section} className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.025] px-2 py-1 text-[8px] font-bold text-[#85858d]">
                <span className="font-mono text-[7px] text-[var(--report-accent)]">{index + 1}</span>{section}
              </li>
            ))}
          </ol>
        </div>
      </header>
      <div className="aw-report-body min-w-0">{children}</div>
    </div>
  );
}
