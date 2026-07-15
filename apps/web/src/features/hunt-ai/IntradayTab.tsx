import {
  Area,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PremiumAiButton } from "../../components/PremiumAiButton";
import { AgentCall } from "../../components/agents/AgentCall";
import { EmptyPanel, RetryPanel } from "../../components/ui/panels";
import { paddedDomain } from "../../lib/chart";
import { formatCurrency } from "../../lib/format";
import { PremiumChartTooltip } from "./ChartTooltip";
import { buildTechnicalChartData, colorForTone, formatAnalyzedAt, moneyMaybe, stopFromEntry } from "./lib";
import { ChartLoading, SpinnerOrb, agentLoadingTitle, agentName, panel, PremiumLoading } from "./ui";
import type { HuntAi } from "./useHuntAi";

export function IntradayTab({ hunt }: { hunt: HuntAi }) {
  const intraday = hunt.intraday;
  if (!intraday.ticker) return <EmptyPanel title="No stock selected" body="Add a stock to the shared watchlist, then Live Intraday can read the tape for it." />;

  const detail = intraday.detail;
  const analysis = intraday.analysis;
  const data = buildTechnicalChartData(detail);
  const domain = paddedDomain(
    [
      ...data.flatMap((point) => [point.close, point.ma10, point.vwap, point.bbUpper, point.bbLower]),
      detail?.technicals.support,
      detail?.technicals.resistance,
      analysis?.entryPrice?.entryPrice,
    ],
    0.14,
  );
  const currency = detail?.stock.currency ?? "USD";
  const price = detail?.stock.price;
  const change = detail?.stock.changePct ?? 0;
  const up = change >= 0;
  const tone = analysis ? colorForTone(analysis.tone) : "#3ecf8e";

  return (
    <div className="flex flex-col gap-3">
      <LegendBar />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11.5px] font-medium text-[#8c8c95]">Watching:</span>
        {intraday.symbols.map((symbol) => (
          <button
            key={symbol}
            type="button"
            onClick={() => intraday.select(symbol)}
            className={`rounded-[7px] border px-2.5 py-1.5 font-mono text-[11.5px] font-bold ${intraday.ticker === symbol ? "border-[#c77dff]/50 bg-[#c77dff]/10" : "border-[#2a2a31] bg-[#161619] hover:border-[#3ecf8e]"}`}
          >
            {symbol}
          </button>
        ))}
      </div>
      <div className="grid items-start gap-3 min-[1100px]:grid-cols-[minmax(0,1fr)_380px]">
        <div className={`${panel} p-3.5`}>
          <div className="mb-2.5 flex flex-wrap items-baseline gap-3">
            <span className="font-mono text-[22px] font-bold tracking-[-0.3px]">{price == null ? "—" : formatCurrency(price, currency)}</span>
            <span className={`font-mono text-[13px] ${up ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>{price == null ? "" : `${up ? "+" : ""}${change.toFixed(3)}%`}</span>
            <span className="ml-auto font-mono text-[11px] text-[#5a5a62]">{detail?.stock.symbol ?? intraday.ticker}</span>
          </div>
          <div className="h-[190px]">
            {intraday.pending ? <ChartLoading label={`Loading ${intraday.ticker} chart...`} /> : null}
            {intraday.failed ? <RetryPanel label={`Could not load ${intraday.ticker} chart.`} onRetry={intraday.retry} /> : null}
            {detail && !intraday.failed ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="huntIntradayFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3ecf8e" stopOpacity={0.24} />
                      <stop offset="100%" stopColor="#3ecf8e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis hide dataKey="label" />
                  <YAxis hide domain={domain} />
                  <Tooltip
                    cursor={{ stroke: "#c77dff", strokeWidth: 1, strokeDasharray: "3 4", strokeOpacity: 0.55 }}
                    content={
                      <PremiumChartTooltip
                        currency={currency}
                        labels={{
                          close: "Price",
                          vwap: "VWAP",
                          ma10: "MA10",
                          bbUpper: "BB upper",
                          bbLower: "BB lower",
                        }}
                        extras={[
                          detail.technicals.support != null ? ["Support", formatCurrency(detail.technicals.support, currency), "#3ecf8e"] : null,
                          detail.technicals.resistance != null ? ["Resistance", formatCurrency(detail.technicals.resistance, currency), "#f2575c"] : null,
                          analysis?.entryPrice?.entryPrice != null ? ["AI entry", formatCurrency(analysis.entryPrice.entryPrice, currency), "#c77dff"] : null,
                        ]}
                      />
                    }
                  />
                  {detail.technicals.support != null ? <ReferenceLine y={detail.technicals.support} stroke="#3ecf8e" strokeDasharray="4 3" strokeOpacity={0.55} /> : null}
                  {detail.technicals.resistance != null ? <ReferenceLine y={detail.technicals.resistance} stroke="#f2575c" strokeDasharray="4 3" strokeOpacity={0.55} /> : null}
                  {analysis?.entryPrice?.entryPrice != null ? <ReferenceLine y={analysis.entryPrice.entryPrice} stroke="#c77dff" strokeDasharray="3 3" strokeOpacity={0.8} /> : null}
                  <Area type="monotone" dataKey="close" name="Price" stroke="#3ecf8e" strokeWidth={2} fill="url(#huntIntradayFill)" dot={false} activeDot={{ r: 5, fill: "#3ecf8e", stroke: "#0d0f11", strokeWidth: 2 }} isAnimationActive={false} />
                  <Line type="monotone" dataKey="vwap" name="VWAP" stroke="#74a4ff" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls isAnimationActive={false} />
                  <Line type="monotone" dataKey="ma10" name="MA10" stroke="#f5c451" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
                  <Line type="monotone" dataKey="bbUpper" stroke="#c77dff" strokeWidth={1.1} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
                  <Line type="monotone" dataKey="bbLower" stroke="#c77dff" strokeWidth={1.1} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
                  {analysis?.entryPrice?.entryPrice != null && data.length ? (
                    <ReferenceDot x={data[data.length - 1].label} y={analysis.entryPrice.entryPrice} r={5} fill="#c77dff" stroke="#161619" strokeWidth={2} />
                  ) : null}
                </ComposedChart>
              </ResponsiveContainer>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          {intraday.aiLoading ? (
            <PremiumLoading title={agentLoadingTitle(hunt.activeAgentId, "intraday", intraday.ticker)} subject={intraday.ticker} agentId={hunt.activeAgentId} task="intraday" />
          ) : analysis ? (
            <AgentCall
              agent={analysis.agent}
              label="Intraday signal"
              score={analysis.confidence}
              scoreLabel="Signal confidence"
              signal={analysis.signal}
              headline={`${intraday.ticker} · live tape read`}
              summary={analysis.summary}
              accent={tone}
              metrics={[
                { label: "Enter at", value: moneyMaybe(analysis.entryPrice?.entryPrice, currency), color: tone },
                { label: "Stop loss", value: moneyMaybe(stopFromEntry(analysis.entryPrice?.entryPrice), currency), color: "#f2575c" },
                { label: "Take profit", value: moneyMaybe(analysis.targetPrice?.targetPrice, currency), color: "#3ecf8e" },
              ]}
              meta={`Cached ${formatAnalyzedAt(intraday.analyzedAt)} · delayed quote`}
              dataTrust={analysis.dataTrust}
            />
          ) : (
            <div className="rounded-[var(--aw-radius-card)] border border-[#2a2a31] bg-[#161619] p-5 text-center">
              <SpinnerOrb />
              <div className="mb-1.5 text-[13px] font-semibold">{intraday.aiLoading ? `${agentName(hunt.activeAgentId)} is reading...` : `${agentName(hunt.activeAgentId)} is watching...`}</div>
              <div className="mx-auto max-w-[260px] text-[12px] leading-[1.6] text-[#8c8c95]">One explicit read. Entry, stop, target and signal score appear here when requested.</div>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            {!intraday.aiLoading && analysis ? (
              <div className="text-right font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-white">
                Last sync {formatAnalyzedAt(intraday.analyzedAt)}
              </div>
            ) : null}
            <PremiumAiButton
              label={intraday.aiLoading ? "Reading..." : analysis ? "Refresh AI signal" : "Get AI signal now"}
              sublabel={analysis ? "Premium · cached signal" : "Premium · live tape"}
              disabled={intraday.aiLoading || intraday.pending}
              loading={intraday.aiLoading}
              onClick={() => void intraday.run(Boolean(analysis))}
              size="compact"
              className="w-full"
            />
          </div>
        </div>
      </div>
      <div className="text-center font-mono text-[10px] text-[#5a5a62]">Real delayed quotes - technical read only - not financial advice</div>
    </div>
  );
}

function LegendBar() {
  return (
    <div className={`${panel} flex flex-wrap items-center gap-3 px-3 py-2 text-[10.5px] text-[#8c8c95]`}>
      <LegendLine color="#3ecf8e" label="Price" />
      <LegendDashed color="#74a4ff" label="VWAP" />
      <LegendLine color="#f5c451" label="MA10" />
      <LegendDashed color="#c77dff" label="Bollinger Bands" />
      <LegendDashed color="#3ecf8e" label="Support" muted />
      <LegendDashed color="#f2575c" label="Resistance" muted />
      <span className="flex items-center gap-1.5"><span className="inline-block h-[10px] w-[10px] rounded-[2px]" style={{ background: "linear-gradient(135deg,#3ecf8e,#c77dff)" }} />AI signal marker</span>
    </div>
  );
}

function LegendLine({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className="inline-block h-[2px] w-4 rounded" style={{ background: color }} />{label}</span>;
}

function LegendDashed({ color, label, muted }: { color: string; label: string; muted?: boolean }) {
  return <span className="flex items-center gap-1.5"><span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: color, opacity: muted ? 0.6 : 1 }} />{label}</span>;
}
