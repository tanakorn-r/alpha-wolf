import type { HistoricalAnalysisResponse, HistoricalTimelineEvent, NewsResearchSource } from "../../lib/api";
import type { HuntAi } from "./useHuntAi";
import { agentLoadingTitle, agentName, PremiumLoading } from "./ui";

const verdictTone: Record<HistoricalAnalysisResponse["verdict"], string> = {
  IMPROVING: "#3ecf8e",
  STABLE: "#74a4ff",
  DETERIORATING: "#ff6b75",
  TURNAROUND: "#c77dff",
  CYCLICAL: "#f5c451",
  INSUFFICIENT_DATA: "#8c8c95",
};

const yearTone: Record<HistoricalAnalysisResponse["currentYear"]["direction"], string> = {
  BETTER: "#3ecf8e",
  WORSE: "#ff6b75",
  MIXED: "#f5c451",
  TOO_EARLY: "#8c8c95",
};

const moveTone: Record<HistoricalTimelineEvent["priceDirection"], string> = {
  UP: "#3ecf8e",
  DOWN: "#ff6b75",
  SIDEWAYS: "#74a4ff",
  MIXED: "#f5c451",
  UNKNOWN: "#777780",
};

export function HistoricalAnalysisTab({ hunt }: { hunt: HuntAi }) {
  const result = hunt.history.analysis;
  if (hunt.history.loading && !result) {
    return (
      <PremiumLoading
        title={agentLoadingTitle(hunt.activeAgentId, "history", hunt.history.ticker)}
        subject={hunt.history.ticker}
        agentId={hunt.activeAgentId}
        task="history"
      />
    );
  }
  if (hunt.history.error && !result) {
    return (
      <section className="rounded-[12px] border border-[#f2575c]/35 bg-[#f2575c]/[0.06] p-5">
        <div className="text-[9px] font-black uppercase tracking-[0.13em] text-[#ff7c83]">Historical analysis stopped</div>
        <h3 className="mt-2 text-[17px] font-extrabold">The historical evidence could not be reconstructed.</h3>
        <p className="mt-2 text-[11.5px] leading-[1.6] text-[#aaaab2]">{hunt.history.error}</p>
        <button type="button" onClick={() => void hunt.history.run(true)} className="mt-4 rounded-[8px] border border-[#f2575c]/45 bg-[#f2575c]/10 px-3 py-2 text-[10.5px] font-bold text-[#ff9ca1] hover:bg-[#f2575c]/20">Retry historical research</button>
      </section>
    );
  }
  if (!result) return null;

  const accent = verdictTone[result.verdict];
  const sourceByRank = (ranks: number[]) => ranks.map((rank) => ({ rank, source: result.sources[rank - 1] })).filter((item): item is { rank: number; source: NewsResearchSource } => Boolean(item.source));

  return (
    <article className="aw-result-product aw-result-history min-w-0 overflow-hidden rounded-[13px] border border-[#303038] bg-[#111214]">
      <header className="border-b border-white/[0.07] bg-[radial-gradient(circle_at_85%_10%,rgba(116,164,255,.11),transparent_38%),#141518] p-4 min-[700px]:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.13em] text-[#74a4ff]">{agentName(hunt.activeAgentId)} · historical analysis · {result.historyWindow}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-[6px] border px-2.5 py-1 text-[10px] font-black" style={{ color: accent, borderColor: `${accent}66`, backgroundColor: `${accent}12` }}>{result.verdict.replace("_", " ")}</span>
              <span className="font-mono text-[11px] font-bold text-[#ececee]">{result.rating}/100</span>
              {hunt.history.loading ? <span className="inline-flex items-center gap-1.5 text-[9px] font-bold text-[#74a4ff]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#74a4ff]" />Refreshing history</span> : null}
            </div>
          </div>
          <button type="button" onClick={() => void hunt.history.run(true)} disabled={hunt.history.loading} className="rounded-[8px] border border-[#34343c] bg-[#17181b] px-3 py-2 text-[10px] font-bold text-[#b8b8c0] hover:border-[#74a4ff]/55 disabled:opacity-50">Refresh research</button>
        </div>
        <h2 className="mt-4 max-w-[900px] text-[clamp(19px,2.2vw,28px)] font-extrabold leading-[1.22] tracking-[-0.45px]">{result.headline}</h2>
        <p className="mt-2 line-clamp-3 max-w-[950px] text-[12px] leading-[1.7] text-[#aaaab2]">{result.summary}</p>
        <HistoryPulse timeline={result.timeline} />
      </header>

      <div className="grid gap-3 p-3 min-[700px]:grid-cols-2 min-[700px]:p-4">
        <StoryCard label="Why the price looked like this" body={result.priceStory} tone="#74a4ff" />
        <StoryCard label="What earnings and the business did" body={result.earningsStory} tone="#d6b36a" />
      </div>

      <section className="mx-3 rounded-[11px] border p-4 min-[700px]:mx-4" style={{ borderColor: `${yearTone[result.currentYear.direction]}55`, backgroundColor: `${yearTone[result.currentYear.direction]}0b` }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[9px] font-black uppercase tracking-[0.13em] text-[#8c8c95]">This year versus its own history</div>
          <span className="text-[15px] font-black" style={{ color: yearTone[result.currentYear.direction] }}>{result.currentYear.direction.replace("_", " ")}</span>
        </div>
        <p className="mt-2 line-clamp-2 text-[13px] font-bold leading-[1.55] text-[#ececee]">{result.currentYear.whatChanged}</p>
        <p className="mt-2 line-clamp-3 text-[11.5px] leading-[1.65] text-[#a1a1aa]">{result.currentYear.comparisonWithHistory}</p>
        <div className="mt-3 grid gap-2 min-[760px]:grid-cols-2">{result.currentYear.evidence.map((item) => <div key={item} className="rounded-[8px] border border-white/[0.06] bg-black/20 px-3 py-2.5 text-[10.5px] leading-[1.5] text-[#c3c3ca]">{item}</div>)}</div>
        <SourceChips items={sourceByRank(result.currentYear.sourceRanks)} />
      </section>

      <section className="p-3 min-[700px]:p-4">
        <div className="mb-3 flex items-end justify-between gap-3"><div><div className="text-[9px] font-black uppercase tracking-[0.13em] text-[#74a4ff]">Causal timeline</div><h3 className="mt-1 text-[16px] font-extrabold">What changed, then how the market reacted</h3></div><span className="text-[9px] text-[#696972]">Evidence, not date coincidence</span></div>
        <div className="relative space-y-2 before:absolute before:bottom-5 before:left-[16px] before:top-5 before:w-px before:bg-[#303038]">{result.timeline.slice(0, 4).map((event, index) => <TimelineEventCard key={`${event.period}-${index}`} event={event} sources={sourceByRank(event.sourceRanks)} />)}</div>
        {result.timeline.length > 4 ? <details className="mt-2 rounded-[9px] border border-white/[0.07] bg-black/10 px-3 py-2.5"><summary className="cursor-pointer text-[9.5px] font-bold text-[#74a4ff]">Show {result.timeline.length - 4} earlier/later turning point{result.timeline.length - 4 === 1 ? "" : "s"}</summary><div className="mt-2 space-y-2">{result.timeline.slice(4).map((event, index) => <TimelineEventCard key={`${event.period}-${index + 4}`} event={event} sources={sourceByRank(event.sourceRanks)} />)}</div></details> : null}
      </section>

      <section className="grid gap-3 border-t border-white/[0.07] p-3 min-[760px]:grid-cols-[.9fr_1.1fr] min-[760px]:p-4">
        <div className="rounded-[10px] border border-[#303038] bg-[#151619] p-4"><div className="text-[9px] font-black uppercase tracking-[0.12em] text-[#c77dff]">Lessons from history</div><ul className="mt-3 space-y-2">{result.historyLessons.map((lesson) => <li key={lesson} className="flex gap-2 text-[11px] leading-[1.55] text-[#b8b8c0]"><span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-[#c77dff]" />{lesson}</li>)}</ul></div>
        <div className="rounded-[10px] border border-[#303038] bg-[#151619] p-4"><div className="flex items-center justify-between gap-2"><div className="text-[9px] font-black uppercase tracking-[0.12em] text-[#3ecf8e]">Forward bridge</div><span className="text-[10px] font-black text-[#3ecf8e]">{result.forwardOutlook.direction}</span></div><p className="mt-2 text-[11.5px] font-semibold leading-[1.6] text-[#d4d4da]">{result.forwardOutlook.thesis}</p><div className="mt-3 grid gap-3 min-[650px]:grid-cols-2"><MiniList label="Could improve" items={result.forwardOutlook.catalysts} color="#3ecf8e" /><MiniList label="Could break" items={result.forwardOutlook.risks} color="#ff6b75" /></div></div>
      </section>

      <section className="mx-3 mb-3 rounded-[10px] border border-[#d6b36a]/30 bg-[#d6b36a]/[0.06] p-4 min-[700px]:mx-4 min-[700px]:mb-4"><div className="text-[9px] font-black uppercase tracking-[0.12em] text-[#d6b36a]">{agentName(hunt.activeAgentId)}'s conclusion</div><p className="mt-2 text-[12.5px] font-semibold leading-[1.65] text-[#e2e2e6]">{result.agentConclusion}</p></section>

      <details className="border-t border-white/[0.07] px-4 py-3"><summary className="cursor-pointer text-[9px] font-black uppercase tracking-[0.12em] text-[#777780]">Research sources · {result.sources.length}</summary><div className="mt-3 grid gap-2">{result.sources.map((source, index) => <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer" className="flex items-start gap-3 rounded-[8px] border border-[#28282f] bg-[#151619] p-3 hover:border-[#74a4ff]/45"><span className="font-mono text-[10px] font-bold text-[#74a4ff]">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0"><span className="block text-[10.5px] font-bold text-[#d0d0d6]">{source.title}</span><span className="mt-1 block text-[9.5px] text-[#777780]">{source.publisher} · {source.whyItMatters}</span></span></a>)}</div></details>
    </article>
  );
}

function HistoryPulse({ timeline }: { timeline: HistoricalTimelineEvent[] }) {
  return <div className="mt-4 rounded-[9px] border border-white/[0.07] bg-black/20 px-3 py-2.5"><div className="flex h-8 items-center gap-1">{timeline.map((event, index) => { const height = event.priceDirection === "UP" || event.priceDirection === "DOWN" ? 28 : event.priceDirection === "MIXED" ? 20 : 12; return <span key={`${event.period}-${index}`} className="group relative flex-1 rounded-[3px] transition hover:brightness-125" style={{ height, background: moveTone[event.priceDirection] }} title={`${event.period}: ${event.priceDirection}`} />; })}</div><div className="mt-1.5 flex justify-between text-[8px] font-bold uppercase tracking-[0.08em] text-[#5f5f68]"><span>{timeline[0]?.period}</span><span>Price regimes</span><span>{timeline.at(-1)?.period}</span></div></div>;
}

function TimelineEventCard({ event, sources }: { event: HistoricalTimelineEvent; sources: Array<{ rank: number; source: NewsResearchSource }> }) {
  return <div className="relative grid gap-2 rounded-[10px] border border-[#292930] bg-[#151619] p-3 pl-11 min-[800px]:grid-cols-[118px_1fr_1fr]"><span className="absolute left-[9px] top-[17px] h-[15px] w-[15px] rounded-full border-[4px] border-[#151619]" style={{ backgroundColor: moveTone[event.priceDirection], boxShadow: `0 0 0 1px ${moveTone[event.priceDirection]}66` }} /><div><div className="font-mono text-[10.5px] font-bold text-[#ececee]">{event.period}</div><div className="mt-1 text-[8.5px] font-black tracking-[0.08em]" style={{ color: moveTone[event.priceDirection] }}>{event.priceDirection}</div></div><div><div className="line-clamp-2 text-[11.5px] font-bold leading-[1.45] text-[#d8d8dd]">{event.event}</div><p className="mt-1 line-clamp-2 text-[10.5px] leading-[1.55] text-[#8f8f98]">{event.businessChange}</p></div><div><div className="text-[8.5px] font-black uppercase tracking-[0.1em] text-[#696972]">Market impact</div><p className="mt-1 line-clamp-3 text-[10.5px] leading-[1.55] text-[#b2b2ba]">{event.marketImpact}</p><SourceChips items={sources} compact /></div></div>;
}

function StoryCard({ label, body, tone }: { label: string; body: string; tone: string }) {
  return <details className="group rounded-[10px] border border-[#303038] bg-[#151619] p-4"><summary className="cursor-pointer list-none"><div className="flex items-center justify-between gap-2"><div className="text-[9px] font-black uppercase tracking-[0.12em]" style={{ color: tone }}>{label}</div><span className="text-[11px] text-[#686871] group-open:hidden">＋</span><span className="hidden text-[11px] text-[#686871] group-open:inline">−</span></div><p className="mt-2 line-clamp-3 text-[11.5px] leading-[1.65] text-[#b8b8c0] group-open:hidden">{body}</p></summary><p className="mt-2 border-t border-white/[0.06] pt-2 text-[11px] leading-[1.65] text-[#9999a2]">{body}</p></details>;
}

function MiniList({ label, items, color }: { label: string; items: string[]; color: string }) {
  return <div><div className="text-[8.5px] font-black uppercase tracking-[0.1em]" style={{ color }}>{label}</div><ul className="mt-2 space-y-1.5">{items.map((item) => <li key={item} className="flex gap-2 text-[10px] leading-[1.5] text-[#9999a2]"><span style={{ color }}>•</span>{item}</li>)}</ul></div>;
}

function SourceChips({ items, compact = false }: { items: Array<{ rank: number; source: NewsResearchSource }>; compact?: boolean }) {
  if (!items.length) return null;
  return <div className={compact ? "mt-2 flex flex-wrap gap-1" : "mt-3 flex flex-wrap gap-1.5"}>{items.map(({ rank, source }) => <a key={`${rank}-${source.url}`} href={source.url} target="_blank" rel="noreferrer" title={source.title} className="rounded-[5px] border border-[#74a4ff]/25 bg-[#74a4ff]/[0.07] px-1.5 py-1 text-[8.5px] font-bold text-[#8bb3ff] hover:border-[#74a4ff]/60">[{rank}] {source.publisher}</a>)}</div>;
}
