import type { HuntTab } from "./lib";
import type { HuntAi } from "./useHuntAi";

type DecisionMode = {
  key: Extract<HuntTab, "signals" | "analyst" | "history" | "timing" | "technical">;
  index: string;
  title: string;
  answer: string;
  horizon: string;
  premium: boolean;
};

const modes: DecisionMode[] = [
  { key: "signals", index: "01", title: "Quick verdict", answer: "What should I do now?", horizon: "60 sec read", premium: false },
  { key: "analyst", index: "02", title: "Deep analysis", answer: "Is the thesis investable?", horizon: "Full dossier", premium: true },
  { key: "history", index: "03", title: "Historical analysis", answer: "What actually drove returns?", horizon: "Cycle view", premium: true },
  { key: "timing", index: "04", title: "Buy timing", answer: "How should I deploy capital?", horizon: "12-month plan", premium: true },
  { key: "technical", index: "05", title: "Chart read", answer: "Where does the setup break?", horizon: "Market structure", premium: true },
];

export function DecisionModeRail({ hunt, agentName, agentColor }: { hunt: HuntAi; agentName: string; agentColor?: string }) {
  const accent = agentColor ?? "#3ecf8e";

  function stateFor(mode: DecisionMode) {
    if (mode.key === "signals") return hunt.signals.fetching || hunt.signals.pending ? "running" : hunt.signals.hasRun ? "saved" : "ready";
    if (mode.key === "analyst") return hunt.analyst.loading ? "running" : hunt.analyst.analysis ? "saved" : "ready";
    if (mode.key === "history") return hunt.history.loading ? "running" : hunt.history.analysis ? "saved" : "ready";
    if (mode.key === "timing") {
      const row = hunt.timing.rows[0];
      return row?.pending || row?.fetching ? "running" : row?.timing ? "saved" : "ready";
    }
    return hunt.technical.aiLoading ? "running" : hunt.technical.analysis ? "saved" : "ready";
  }

  function choose(mode: DecisionMode) {
    if (!hunt.signedIn) {
      hunt.showAccountSignIn();
      return;
    }
    hunt.setTab(mode.key);
    if (mode.premium && !hunt.premium) return;
    const state = stateFor(mode);
    if (state === "saved" || state === "running") return;
    if (mode.key === "signals") hunt.signals.run();
    if (mode.key === "analyst") void hunt.analyst.run();
    if (mode.key === "history") void hunt.history.run(false);
    if (mode.key === "timing") hunt.timing.rows[0]?.run();
    if (mode.key === "technical") void hunt.technical.run(false);
  }

  return (
    <section className="aw-decision-rail overflow-hidden rounded-[15px] border border-white/[0.08] bg-[#101113] shadow-[0_18px_55px_rgba(0,0,0,.28)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-3.5 py-3 min-[720px]:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative grid h-8 w-8 flex-none place-items-center rounded-[9px] border border-[#3ecf8e]/25 bg-[#3ecf8e]/[0.07]">
            <span className="h-2 w-2 rounded-full bg-[#65e7ad] shadow-[0_0_16px_rgba(62,207,142,.8)]" />
            <span className="absolute inset-[5px] rounded-[6px] border border-[#3ecf8e]/10" />
          </span>
          <div className="min-w-0">
            <div className="text-[9px] font-black uppercase tracking-[0.15em] text-[#65e7ad]">AlphaWolf intelligence</div>
            <div className="mt-0.5 truncate text-[11px] text-[#777780]">Five decision lenses · one source of truth for {hunt.watchlist.activeTicker || "your next stock"}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/[0.07] bg-black/20 py-1.5 pl-2 pr-3">
          <span className="h-2 w-2 rounded-full" style={{ background: accent, boxShadow: `0 0 10px ${accent}` }} />
          <span className="text-[9px] font-bold text-[#a7a7af]">{agentName} active</span>
        </div>
      </div>

      <div className="aw-decision-scroll grid auto-cols-[minmax(210px,1fr)] grid-flow-col overflow-x-auto [scrollbar-width:none] min-[1180px]:grid-flow-row min-[1180px]:grid-cols-5">
        {modes.map((mode) => {
          const active = hunt.tab === mode.key;
          const state = stateFor(mode);
          const locked = mode.premium && !hunt.premium;
          return (
            <button
              key={mode.key}
              type="button"
              onClick={() => choose(mode)}
              aria-pressed={active}
              className={`aw-decision-mode group relative min-h-[112px] snap-start border-r border-white/[0.06] px-3.5 py-3 text-left transition duration-200 last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#3ecf8e]/70 ${active ? "bg-[linear-gradient(155deg,rgba(62,207,142,.12),rgba(62,207,142,.025)_68%)]" : "bg-[#111214] hover:bg-[#151719]"}`}
            >
              {active ? <span className="absolute inset-x-3.5 top-0 h-px bg-gradient-to-r from-transparent via-[#65e7ad] to-transparent shadow-[0_0_12px_rgba(62,207,142,.65)]" /> : null}
              <span className="aw-mode-meta flex items-center justify-between gap-2">
                <span className="font-mono text-[8.5px] font-semibold tracking-[0.08em] text-[#55555e]">{mode.index}</span>
                <span className={`rounded-[5px] border px-1.5 py-0.5 text-[7.5px] font-black uppercase tracking-[0.08em] ${locked ? "border-[#c8a6ff]/20 bg-[#c8a6ff]/[0.07] text-[#c8a6ff]" : state === "saved" ? "border-[#74a4ff]/20 bg-[#74a4ff]/[0.07] text-[#8db4ff]" : state === "running" ? "border-[#3ecf8e]/25 bg-[#3ecf8e]/[0.07] text-[#65e7ad]" : "border-white/[0.07] bg-white/[0.025] text-[#686871]"}`}>
                  {locked ? "Pro" : state === "saved" ? "Saved" : state === "running" ? "Live" : mode.premium ? mode.horizon : "Free"}
                </span>
              </span>
              <span className={`aw-mode-title mt-3 block text-[12px] font-extrabold tracking-[-0.12px] ${active ? "text-[#f1f4f2]" : "text-[#c7c7cd] group-hover:text-[#ececee]"}`}>{mode.title}</span>
              <span className="aw-mode-question mt-1.5 block text-[9.5px] leading-[1.45] text-[#72727b] group-hover:text-[#92929a]">{mode.answer}</span>
              <span className={`aw-mode-arrow absolute bottom-3 right-3.5 text-[13px] transition-transform duration-200 group-hover:translate-x-0.5 ${active ? "text-[#65e7ad]" : "text-[#4f4f57]"}`}>→</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
