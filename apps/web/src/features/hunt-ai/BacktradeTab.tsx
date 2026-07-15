import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PremiumAiButton } from "../../components/PremiumAiButton";
import { ErrorCard, TickerEmptyPanel } from "../../components/ui/panels";
import { loadBacktradeJob, startBacktrade, type BacktradeDecision, type BacktradeJob, type BacktradeResult } from "../../lib/api";
import type { HuntAi } from "./useHuntAi";

export function BacktradeTab({ hunt }: { hunt: HuntAi }) {
  const symbol = hunt.watchlist.activeTicker;
  const [years, setYears] = useState(5);
  const [contribution, setContribution] = useState(100);
  const [jobId, setJobId] = useState(hunt.replay.savedJobId);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const jobQuery = useQuery({
    queryKey: ["backtrade-job", jobId],
    queryFn: () => loadBacktradeJob(jobId),
    enabled: Boolean(jobId),
    retry: 0,
    refetchInterval: (query) => query.state.data?.status === "complete" || query.state.data?.status === "failed" ? false : 1500,
  });
  const job = jobQuery.data;

  useEffect(() => setJobId(hunt.replay.savedJobId), [hunt.replay.savedJobId, symbol, hunt.activeAgentId]);

  async function run() {
    if (!symbol || starting) return;
    setStarting(true);
    setError("");
    try {
      const created = await startBacktrade({ symbol, agent: hunt.activeAgentId, years, monthlyContribution: contribution, mode: "monthly" });
      setJobId(created.id);
      hunt.replay.persistJob(created.id);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not start AI Replay.");
    } finally {
      setStarting(false);
    }
  }

  if (!symbol) return <TickerEmptyPanel body="Add or select an asset in the Hunt watchlist above to run AI Replay." />;

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-[var(--aw-radius-card)] border border-[#2a2a31] bg-[#161619] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#3ecf8e]">Walk-forward AI Replay</div>
            <h2 className="mt-1 text-[17px] font-bold text-[#ececee]">{symbol} · one combined {job?.agent.name ?? "Agent"} decision per month</h2>
            <p className="mt-1 max-w-[760px] text-[12px] leading-[1.5] text-[#8c8c95]">One decision at the prior month-end, executed on the first trading session of each month, with a DCA benchmark and audit log.</p>
          </div>
          <PremiumAiButton label={starting ? "Starting" : job?.status === "running" || job?.status === "queued" ? "Replay running" : "Run AI Replay"} sublabel="Background job" disabled={starting || job?.status === "running" || job?.status === "queued"} loading={starting || job?.status === "running" || job?.status === "queued"} onClick={() => void run()} size="compact" />
        </div>
        <div className="mt-4 grid gap-2.5 min-[720px]:grid-cols-2">
          <Control label="History">
            <select value={years} onChange={(event) => setYears(Number(event.target.value))} className="w-full rounded-[7px] border border-[#2a2a31] bg-[#0e0e10] px-3 py-2 text-[12px] text-[#ececee]">
              <option value={1}>1 year</option><option value={3}>3 years</option><option value={5}>5 years</option>
            </select>
          </Control>
          <Control label="Monthly contribution">
            <input type="number" min={1} value={contribution} onChange={(event) => setContribution(Math.max(1, Number(event.target.value) || 1))} className="w-full rounded-[7px] border border-[#2a2a31] bg-[#0e0e10] px-3 py-2 font-mono text-[12px] text-[#ececee]" />
          </Control>
        </div>
        <p className="mt-2 text-right text-[10px] text-[#66666f]">Uses {years * 12 + 1} AI tokens for {years} year{years === 1 ? "" : "s"}.</p>
      </section>
      {error ? <ErrorCard message={error} /> : null}
      {jobQuery.isError ? <ErrorCard message={(jobQuery.error as Error).message} /> : null}
      {job?.status === "queued" || job?.status === "running" ? <ReplayProgress job={job} /> : null}
      {job?.status === "failed" ? <ErrorCard message={job.error || "Replay failed."} /> : null}
      {job?.status === "complete" && job.result ? <ReplayResult result={job.result} /> : null}
    </div>
  );
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[9.5px] font-bold uppercase tracking-[0.06em] text-[#6f6f78]">{label}</span>{children}</label>;
}

function ReplayProgress({ job }: { job: BacktradeJob }) {
  return (
    <section className="rounded-[var(--aw-radius-card)] border border-[#2a2a31] bg-[#161619] p-4">
      <div className="flex items-center justify-between gap-3"><div className="text-[13px] font-bold text-[#ececee]">{job.stage}</div><div className="font-mono text-[15px] font-bold text-[#3ecf8e]">{job.progress}%</div></div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#242429]"><div className="h-full rounded-full bg-[#3ecf8e] transition-[width]" style={{ width: `${job.progress}%` }} /></div>
      <div className="mt-2 text-[10px] text-[#6f6f78]">The replay runs independently; other Alpha Wolf pages remain available.</div>
    </section>
  );
}

function ReplayResult({ result }: { result: BacktradeResult }) {
  const difference = result.endingValue - result.dcaEndingValue;
  const won = difference >= 0;
  return (
    <>
      <section className="rounded-[var(--aw-radius-card)] border border-[#2a2a31] bg-[#161619] p-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#6f6f78]">Replay outcome</div>
        <div className="mt-1 text-[17px] font-bold" style={{ color: won ? "#3ecf8e" : "#f2575c" }}>
          {result.agent.name} finished {Math.abs(difference).toFixed(0)} budget units {won ? "above" : "below"} normal monthly DCA.
        </div>
        <div className="mt-1 text-[11px] text-[#8c8c95]">Both received the same {result.totalContributed.toFixed(0)} total contributions.</div>
      </section>
      <section className="grid gap-2.5 min-[760px]:grid-cols-3">
        <Metric label="Money added" value={result.totalContributed.toFixed(0)} context={`${result.sessions} trading sessions`} color="#ececee" />
        <Metric label={`${result.agent.name} final value`} value={result.endingValue.toFixed(0)} context={`${signed(result.returnPct)}% return · ${result.maxDrawdownPct.toFixed(1)}% max drawdown · +${result.agentDividendsReceived.toFixed(0)} dividends banked as cash`} color={result.returnPct >= 0 ? "#3ecf8e" : "#f2575c"} />
        <Metric label="Normal DCA final value" value={result.dcaEndingValue.toFixed(0)} context={`${signed(result.dcaReturnPct)}% return · ${result.dcaMaxDrawdownPct.toFixed(1)}% max drawdown · +${result.dcaDividendsReinvested.toFixed(0)} dividends auto-reinvested`} color="#ececee" />
      </section>
      <section className="rounded-[var(--aw-radius-card)] border border-[#2a2a31] bg-[#161619] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><div className="text-[15px] font-bold">Price and accumulated P/L</div><div className="text-[10px] text-[#6f6f78]">{result.aiDecisionCount} AI decisions · {result.fallbackDecisionCount} fallback</div></div>
        <ReplayCharts result={result} />
      </section>
      <DecisionTimeline decisions={result.decisions} />
      <div className="rounded-[9px] border border-[#2a2a31] bg-[#111113] px-4 py-3 text-[10.5px] leading-[1.55] text-[#6f6f78]">{result.limitations.join(" · ")}</div>
    </>
  );
}

function Metric({ label, value, context, color }: { label: string; value: string; context: string; color: string }) {
  return <div className="rounded-[10px] border border-[#2a2a31] bg-[#161619] p-3"><div className="text-[9.5px] font-bold uppercase tracking-[0.06em] text-[#6f6f78]">{label}</div><div className="mt-2 font-mono text-[20px] font-extrabold" style={{ color }}>{value}</div><div className="mt-1 text-[10px] text-[#6f6f78]">{context}</div></div>;
}

function ReplayCharts({ result }: { result: BacktradeResult }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const profit = useMemo(() => profitChartPaths(result.equity, 900, 215), [result.equity]);
  const price = useMemo(() => priceChartPaths(result.equity, 900, 150), [result.equity]);
  const exposure = useMemo(() => exposureChartPaths(result.equity, 900, 105), [result.equity]);
  const selectedIndex = Math.max(0, Math.min(result.equity.length - 1, hoverIndex ?? result.equity.length - 1));
  const selected = result.equity[selectedIndex];
  const hasPrice = result.equity.every((point) => Number.isFinite(point.price));
  const hasExposure = result.equity.every((point) => Number.isFinite(point.stockExposurePct));
  const inspect = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const viewX = (event.clientX - bounds.left) / Math.max(1, bounds.width) * 900;
    const ratio = Math.max(0, Math.min(1, (viewX - 54) / (884 - 54)));
    setHoverIndex(Math.round(ratio * Math.max(0, result.equity.length - 1)));
  };
  if (!selected) return null;
  return (
    <div className="mt-3" onPointerMove={inspect} onPointerLeave={() => setHoverIndex(null)}>
      <div className="rounded-[7px] border border-[#2a2a31] bg-[#111113] px-3 py-2 font-mono text-[10px] text-[#bcbcc2]">{selected.date} · Price {Number.isFinite(selected.price) ? selected.price.toFixed(2) : "rerun required"} · Agent P/L {signedMoney(selected.agent - selected.contributed)} · Exposure {Number.isFinite(selected.stockExposurePct) ? `${selected.stockExposurePct.toFixed(0)}%` : "rerun required"} · Stock {Number.isFinite(selected.invested) ? selected.invested.toFixed(0) : "—"} · Cash {Number.isFinite(selected.cash) ? selected.cash.toFixed(0) : "—"} · Shares {Number.isFinite(selected.shares) ? selected.shares.toFixed(2) : "—"}</div>
      <div className="mt-3 flex items-baseline justify-between gap-2"><div className="text-[11px] font-bold text-[#ececee]">Real historical price</div><div className="text-[9.5px] text-[#6f6f78]">Yahoo daily adjusted close · move across the chart to inspect</div></div>
      {hasPrice ? <svg viewBox="0 0 900 150" className="mt-1 h-auto w-full touch-none" role="img" aria-label="Historical adjusted stock closing price">
        {price.ticks.map((tick) => <g key={tick.value}><line x1="54" x2="884" y1={tick.y} y2={tick.y} stroke="#29292f" strokeWidth="1" /><text x="47" y={tick.y + 4} textAnchor="end" fill="#6f6f78" fontSize="10">{tick.value.toFixed(2)}</text></g>)}
        <path d={price.path} fill="none" stroke="#74a4ff" strokeWidth="2" />
        <line x1={price.xs[selectedIndex]} x2={price.xs[selectedIndex]} y1="10" y2="126" stroke="#6f6f78" strokeWidth="1" strokeDasharray="3 3" />
        <circle cx={price.xs[selectedIndex]} cy={price.ys[selectedIndex]} r="3.5" fill="#74a4ff" />
      </svg> : <div className="py-6 text-center text-[11px] text-[#6f6f78]">Run a new replay to attach the historical price series to this chart.</div>}
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2"><div className="text-[11px] font-bold text-[#ececee]">Agent stock exposure</div><div className="text-[9.5px] text-[#6f6f78]">Normal DCA is always 100%; partial buys and trims change how strongly the Agent follows price.</div></div>
      {hasExposure ? <svg viewBox="0 0 900 105" className="mt-1 h-auto w-full touch-none" role="img" aria-label="Percentage of the Agent account invested in stock">
        {[0, 50, 100].map((value) => <g key={value}><line x1="54" x2="884" y1={exposure.y(value)} y2={exposure.y(value)} stroke={value === 100 ? "#3b3b43" : "#29292f"} strokeWidth="1" /><text x="47" y={exposure.y(value) + 4} textAnchor="end" fill="#6f6f78" fontSize="10">{value}%</text></g>)}
        <path d={exposure.path} fill="none" stroke="#f5c451" strokeWidth="2" />
        <line x1={exposure.xs[selectedIndex]} x2={exposure.xs[selectedIndex]} y1="8" y2="87" stroke="#6f6f78" strokeWidth="1" strokeDasharray="3 3" />
        <circle cx={exposure.xs[selectedIndex]} cy={exposure.ys[selectedIndex]} r="3.5" fill="#f5c451" />
      </svg> : <div className="py-4 text-center text-[11px] text-[#6f6f78]">Run a new replay to inspect daily stock-versus-cash exposure.</div>}
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2"><div className="text-[11px] font-bold text-[#ececee]">Accumulated profit / loss</div><div className="text-[9.5px] text-[#6f6f78]">Account value minus all deposits—new monthly cash cannot make this line rise.</div></div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#8c8c95]"><span><b className="text-[#3ecf8e]">—</b> {result.agent.name} P/L</span><span><b className="text-[#ececee]">—</b> Normal DCA P/L</span><span><b className="text-[#6f6f78]">—</b> Break-even</span></div>
      <svg viewBox="0 0 900 215" className="mt-1 h-auto w-full touch-none" role="img" aria-label="Accumulated profit or loss after removing monthly contributions">
        {profit.ticks.map((tick) => <g key={tick.value}><line x1="54" x2="884" y1={tick.y} y2={tick.y} stroke={Math.abs(tick.value) < 0.001 ? "#55555e" : "#29292f"} strokeWidth={Math.abs(tick.value) < 0.001 ? "1.5" : "1"} /><text x="47" y={tick.y + 4} textAnchor="end" fill="#6f6f78" fontSize="10">{signedMoney(tick.value)}</text></g>)}
        <path d={profit.dca} fill="none" stroke="#ececee" strokeWidth="2" />
        <path d={profit.agent} fill="none" stroke="#3ecf8e" strokeWidth="2.5" />
        <line x1={profit.xs[selectedIndex]} x2={profit.xs[selectedIndex]} y1="10" y2="187" stroke="#6f6f78" strokeWidth="1" strokeDasharray="3 3" />
        <circle cx={profit.xs[selectedIndex]} cy={profit.agentYs[selectedIndex]} r="3.5" fill="#3ecf8e" />
        <circle cx={profit.xs[selectedIndex]} cy={profit.dcaYs[selectedIndex]} r="3" fill="#ececee" />
        {profit.dates.map((tick) => <text key={tick.label} x={tick.x} y="209" textAnchor={tick.anchor} fill="#6f6f78" fontSize="10">{tick.label}</text>)}
      </svg>
    </div>
  );
}

function profitChartPaths(points: BacktradeResult["equity"], width: number, height: number) {
  const left = 54, right = 16, top = 12, bottom = 28;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const agentValues = points.map((point) => point.agent - point.contributed);
  const dcaValues = points.map((point) => point.dca - point.contributed);
  const rawMin = Math.min(0, ...agentValues, ...dcaValues), rawMax = Math.max(0, ...agentValues, ...dcaValues);
  const padding = Math.max((rawMax - rawMin) * 0.08, 1);
  const min = rawMin - padding, max = rawMax + padding;
  const x = (index: number) => left + index / Math.max(1, points.length - 1) * plotWidth;
  const y = (value: number) => top + (1 - (value - min) / Math.max(0.000001, max - min)) * plotHeight;
  const path = (values: number[]) => values.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const dateIndexes = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const tickValues = [min, min + (max - min) * 0.25, 0, min + (max - min) * 0.75, max].sort((a, b) => a - b);
  return {
    agent: path(agentValues), dca: path(dcaValues),
    xs: points.map((_, index) => x(index)), agentYs: agentValues.map(y), dcaYs: dcaValues.map(y),
    ticks: tickValues.filter((value, index) => index === 0 || Math.abs(value - tickValues[index - 1]) > 0.001).map((value) => ({ value, y: y(value) })),
    dates: dateIndexes.map((index, order) => ({ label: points[index].date.slice(0, 7), x: x(index), anchor: (order === 0 ? "start" : order === 2 ? "end" : "middle") as "start" | "middle" | "end" })),
  };
}

function priceChartPaths(points: BacktradeResult["equity"], width: number, height: number) {
  const left = 54, right = 16, top = 10, bottom = 24;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const rawMin = Math.min(...points.map((point) => point.price)), rawMax = Math.max(...points.map((point) => point.price));
  const padding = Math.max((rawMax - rawMin) * 0.08, rawMax * 0.01, 0.01);
  const min = rawMin - padding, max = rawMax + padding;
  const x = (index: number) => left + index / Math.max(1, points.length - 1) * plotWidth;
  const y = (value: number) => top + (1 - (value - min) / Math.max(0.000001, max - min)) * plotHeight;
  return {
    path: points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.price).toFixed(1)}`).join(" "),
    xs: points.map((_, index) => x(index)), ys: points.map((point) => y(point.price)),
    ticks: [0, 0.5, 1].map((ratio) => ({ value: min + (max - min) * ratio, y: y(min + (max - min) * ratio) })),
  };
}

function exposureChartPaths(points: BacktradeResult["equity"], width: number, height: number) {
  const left = 54, right = 16, top = 8, bottom = 18;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const x = (index: number) => left + index / Math.max(1, points.length - 1) * plotWidth;
  const y = (value: number) => top + (1 - Math.max(0, Math.min(100, value)) / 100) * plotHeight;
  return {
    path: points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.stockExposurePct).toFixed(1)}`).join(" "),
    xs: points.map((_, index) => x(index)), ys: points.map((point) => y(point.stockExposurePct)), y,
  };
}

function DecisionTimeline({ decisions }: { decisions: BacktradeDecision[] }) {
  const visible = decisions.slice(-30).reverse();
  return (
    <section className="rounded-[var(--aw-radius-card)] border border-[#2a2a31] bg-[#161619] p-4">
      <div className="flex items-baseline justify-between gap-2"><div className="text-[15px] font-bold">Decision audit</div><div className="text-[10px] text-[#6f6f78]">Latest {visible.length} of {decisions.length}</div></div>
      <div className="mt-3 divide-y divide-[#24242a]">
        {visible.map((decision) => <div key={decision.date} className="grid gap-1 py-2.5 text-[11px] min-[760px]:grid-cols-[90px_70px_90px_110px_minmax(0,1fr)]"><span className="font-mono text-[#8c8c95]">{decision.date}</span><span className="font-bold" style={{ color: actionColor(decision.action) }}>{decision.action}</span><span className="font-mono text-[#ececee]">Price {decision.close.toFixed(2)}</span><span className="font-mono text-[#bcbcc2]">{decision.action === "BUY" ? `${decision.buyCashPct}% cash` : decision.action === "TRIM" || decision.action === "SELL" ? `${decision.trimPositionPct}% shares` : "No trade"}</span><div className="text-[#8c8c95]"><div><span className="mr-1.5 rounded border border-[#32323a] px-1.5 py-0.5 font-mono text-[9px] text-[#b0b0b8]">{decision.decisionBasis ?? decision.evidenceFocus ?? "BLENDED"}</span>{decision.reason} · executed next open {decision.executedPrice?.toFixed(2) ?? "n/a"} · {decision.source === "ai" ? "AI" : "fallback"}</div>{decision.signalRead && decision.timingRead && decision.analystRead ? <div className="mt-1 text-[10px] text-[#696972]">Signal: {decision.signalRead} · Timing: {decision.timingRead} · Analyst: {decision.analystRead}</div> : null}</div></div>)}
      </div>
    </section>
  );
}

function actionColor(action: BacktradeDecision["action"]) {
  if (action === "BUY") return "#3ecf8e";
  if (action === "TRIM" || action === "SELL") return "#f2575c";
  return "#f5c451";
}

function signed(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`; }
function signedMoney(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(0)}`; }
