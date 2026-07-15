import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PremiumAiButton } from "../../components/PremiumAiButton";
import { AgentCall } from "../../components/agents/AgentCall";
import { TagPill } from "../../components/ui/Badge";
import { EmptyPanel } from "../../components/ui/panels";
import type { HistoricalMove, UpwardMovesResponse } from "../../lib/api";
import { paddedDomain } from "../../lib/chart";
import { formatCurrency } from "../../lib/format";
import { PremiumChartTooltip } from "./ChartTooltip";
import {
  buildTrajectory,
  clamp,
  confidenceLabel,
  directionColor,
  formatAnalyzedAt,
  formatBacktradeDate,
  moneyMaybe,
  phaseLabel,
  windowLabel,
  type MoveDirection,
  type MoveRow,
} from "./lib";
import { panel } from "./ui";

export function Next100Result({ report, timeframe, onRerun, canRerun, analyzedAt }: {
  report: UpwardMovesResponse;
  timeframe: string;
  onRerun: () => void;
  canRerun: boolean;
  analyzedAt: string;
}) {
  if (!report.moves.length) return <EmptyPanel title="No forecast returned" body={`${report.symbol} returned an empty move set from the API.`} />;
  const rows = buildTrajectory(report.currentPrice, report.moves);
  const avgConfidence = Math.round(rows.reduce((sum, row) => sum + row.conf, 0) / rows.length);
  const finalPrice = rows[rows.length - 1].target;
  const gain = report.currentPrice > 0 ? (finalPrice / report.currentPrice - 1) * 100 : 0;
  const currency = report.symbol.endsWith(".BK") ? "THB" : "USD";
  const historicalMoves = report.historicalMoves ?? [];
  const backtradeConfidence = historicalMoves.length ? Math.round(historicalMoves.reduce((sum, move) => sum + move.confidence, 0) / historicalMoves.length) : 0;
  const historicalNetMove = historicalMoves.length ? historicalMoves.slice().reverse().reduce((price, move) => price * (1 + move.movePct / 100), historicalMoves.at(-1)?.fromPrice ?? report.currentPrice) : report.currentPrice;
  const historicalStart = historicalMoves.at(-1)?.fromPrice ?? report.currentPrice;
  const backtradeReturn = historicalStart > 0 ? (historicalNetMove / historicalStart - 1) * 100 : 0;
  const upCount = historicalMoves.filter((move) => move.direction === "UP").length;
  const downCount = historicalMoves.filter((move) => move.direction === "DOWN").length;
  const forecastColor = gain >= 0 ? "#3ecf8e" : "#f2575c";

  return (
    <div className="flex flex-col gap-3">
      <AgentCall agent={report.agent} label="Forecast agent" score={avgConfidence} scoreLabel="scenario confidence" signal={gain >= 0 ? "UPSIDE PATH" : "RISK PATH"} headline={`Next 10 Forecast · ${report.symbol}`} summary={`Past movement first, forecast second. The model maps ${rows.length} future moves from ${formatCurrency(report.currentPrice, currency)} to ${formatCurrency(finalPrice, currency)}.`} accent={forecastColor} meta={`Cached ${formatAnalyzedAt(analyzedAt)} · scenario, not a guaranteed trade`} onRerun={canRerun ? onRerun : undefined} dataTrust={report.dataTrust}>
        <div className="mt-5 grid overflow-hidden rounded-[12px] border border-[#24242a] min-[820px]:grid-cols-3">
          <TapeSummaryCard
            label="1. Last 10 days"
            value={`${backtradeReturn >= 0 ? "+" : ""}${backtradeReturn.toFixed(1)}%`}
            color={backtradeReturn >= 0 ? "#3ecf8e" : "#f2575c"}
            body={historicalMoves.length ? `${upCount} up days, ${downCount} down days. Confidence ${backtradeConfidence}/100 means the recent moves were ${confidenceLabel(backtradeConfidence).toLowerCase()} versus this stock's own history.` : "Not enough recent history came back to score the last 10 days."}
          />
          <TapeSummaryCard
            label="2. AI scenario"
            value={`${gain >= 0 ? "+" : ""}${gain.toFixed(1)}%`}
            color={forecastColor}
            body={`The model maps ${rows.length} future moves from ${formatCurrency(report.currentPrice, currency)} to ${formatCurrency(finalPrice, currency)}. Average confidence is ${avgConfidence}/100.`}
          />
          <TapeSummaryCard
            label="3. How to use it"
            value={gain >= 0 ? "Upside path" : "Risk path"}
            color="#f5c451"
            body="Treat this as one technical scenario. The past 10 days explain the setup; the next 10 moves show the model's expected path, not a guaranteed trade."
          />
        </div>
      </AgentCall>

      <div className={`${panel} px-4 pb-3 pt-4`}>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2.5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[15px] font-semibold">Price Path</div>
              <TagPill label="real history" color="#3ecf8e" />
              <TagPill label="AI forecast" color="#74a4ff" />
            </div>
            <div className="mt-[3px] text-[11.5px] text-[#8c8c95]">Green is actual price history. Blue dashed line is the projected next-10-move path.</div>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-3.5 text-[11px] text-[#8c8c95]">
            <LegendDot color="#3ecf8e" label="Up" />
            <LegendDot color="#f2575c" label="Down" />
            <LegendDot color="#f5c451" label="Flat" />
          </div>
        </div>
        <TrajectoryChart rows={rows} startPrice={report.currentPrice} history={report.history ?? []} currency={currency} />
        <div className="mt-2.5 flex justify-between px-0.5 font-mono text-[10.5px] text-[#5a5a62]">
          <span>Past 100 bars</span>
          <span>Today · {formatCurrency(report.currentPrice, currency)}</span>
          <span>Move #{rows.length} · {formatCurrency(finalPrice, currency)}</span>
        </div>
      </div>
      {historicalMoves.length ? <BacktradePanel moves={historicalMoves} currency={currency} confidence={backtradeConfidence} netMove={backtradeReturn} /> : null}
      <ForecastPanel rows={rows} currency={currency} />
    </div>
  );
}

function TapeSummaryCard({ label, value, body, color }: { label: string; value: string; body: string; color: string }) {
  return (
    <div className="border-t border-[#24242a] px-4 py-3 min-[820px]:border-r min-[820px]:last:border-r-0">
      <div className="mb-1.5 text-[10px] font-semibold uppercase text-[#8c8c95]">{label}</div>
      <div className="mb-1.5 font-mono text-[21px] font-bold leading-none" style={{ color }}>{value}</div>
      <div className="text-[12px] leading-[1.5] text-[#bcbcc2]">{body}</div>
    </div>
  );
}

function BacktradePanel({ moves, currency, confidence, netMove }: { moves: HistoricalMove[]; currency: string; confidence: number; netMove: number }) {
  const upCount = moves.filter((move) => move.direction === "UP").length;
  const downCount = moves.filter((move) => move.direction === "DOWN").length;
  const flatCount = moves.length - upCount - downCount;
  const tone = netMove >= 0 ? "#3ecf8e" : "#f2575c";
  const chronological = moves.slice().reverse();

  return (
    <div className={`${panel} px-4 py-3.5`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[15px] font-semibold">Last 10 Days, In Plain English</div>
            <TagPill label="actual closes" color="#3ecf8e" />
          </div>
          <div className="mt-1 text-[12px] leading-[1.55] text-[#8c8c95]">
            Price moved <span className="font-mono font-semibold" style={{ color: tone }}>{netMove >= 0 ? "+" : ""}{netMove.toFixed(2)}%</span> across the last 10 bars:
            {" "}{upCount} up, {downCount} down, {flatCount} flat. Recent-move strength is {confidence}/100.
          </div>
        </div>
        <span className="rounded-[7px] border border-[#252529] bg-[#0e0e10] px-3 py-1.5 font-mono text-[12px] text-[#ececee]">{confidenceLabel(confidence)}</span>
      </div>

      <div className="grid grid-cols-5 gap-2 min-[760px]:grid-cols-10">
        {chronological.map((move) => {
          const moveColor = directionColor(move.direction);
          const title = [
            `${formatBacktradeDate(move.date)}: ${move.direction} ${move.movePct >= 0 ? "+" : ""}${move.movePct.toFixed(2)}%`,
            `${moneyMaybe(move.fromPrice, currency)} to ${moneyMaybe(move.toPrice, currency)}`,
            `Strength ${move.confidence}/100`,
            move.reason ?? "",
          ].filter(Boolean).join("\n");
          return (
            <div
              key={`${move.date}-${move.movePct}`}
              title={title}
              className="cursor-help rounded-[8px] border border-[#252529] bg-[#0e0e10] px-2 py-2 text-center transition-colors hover:border-[#3ecf8e]/50"
            >
              <div className="mb-1 font-mono text-[10px] text-[#5a5a62]">{formatBacktradeDate(move.date)}</div>
              <div className="font-mono text-[12px] font-bold" style={{ color: moveColor }}>{move.movePct >= 0 ? "+" : ""}{move.movePct.toFixed(1)}%</div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#1c1c20]">
                <div className="h-full rounded-full" style={{ width: `${clamp(move.confidence, 0, 100)}%`, background: moveColor }} />
              </div>
            </div>
          );
        })}
      </div>

      <details className="mt-3 rounded-[9px] border border-[#252529] bg-[#0e0e10] px-3 py-2">
        <summary className="cursor-pointer text-[12px] font-semibold text-[#bcbcc2]">Show day-by-day notes</summary>
        <div className="mt-3 flex flex-col gap-2">
          {chronological.map((move) => {
            const moveColor = directionColor(move.direction);
            return (
              <div key={`detail-${move.date}-${move.movePct}`} className="flex flex-wrap items-start justify-between gap-3 border-t border-[#1f1f24] pt-2 first:border-t-0 first:pt-0">
                <div>
                  <div className="font-mono text-[11.5px] text-[#ececee]">{formatBacktradeDate(move.date)} · {moneyMaybe(move.fromPrice, currency)} to {moneyMaybe(move.toPrice, currency)}</div>
                  <div className="mt-1 text-[11.5px] leading-[1.45] text-[#8c8c95]">{move.reason ?? "Historical move used to calibrate the forecast."}</div>
                </div>
                <div className="font-mono text-[12px] font-bold" style={{ color: moveColor }}>{move.movePct >= 0 ? "+" : ""}{move.movePct.toFixed(2)}% · {move.confidence}/100</div>
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}

function ForecastPanel({ rows, currency }: { rows: MoveRow[]; currency: string }) {
  return (
    <div className={`${panel} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-2.5 pt-3.5">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-[15px] font-semibold">AI Next 10 Scenario</div>
            <TagPill label="forecast" color="#74a4ff" />
          </div>
          <div className="mt-1 text-[12px] text-[#8c8c95]">Each row compounds from the prior projected price.</div>
        </div>
        <span className="font-mono text-[11px] text-[#5a5a62]">Moves #1-10</span>
      </div>
      <div className="grid gap-2 px-4 pb-2 text-[10px] uppercase text-[#5a5a62]" style={{ gridTemplateColumns: "40px 1fr 0.7fr 1.5fr" }}>
        <div>#</div><div>Projected price</div><div className="text-right">Move</div><div>Why</div>
      </div>
      {rows.slice(0, 10).map((row) => {
        const color = directionColor(row.direction);
        const reason = row.reason || phaseLabel(row);
        return (
          <div key={row.i} className="grid items-center gap-2 border-t border-[#1f1f24] px-4 py-2.5" style={{ gridTemplateColumns: "40px 1fr 0.7fr 1.5fr" }}>
            <span className="font-mono text-[12px] text-[#5a5a62]">{row.i}</span>
            <span className="font-mono text-[13px] font-semibold" style={{ color }}>{formatCurrency(row.target, currency)}</span>
            <span className="text-right font-mono text-[12px] font-semibold" style={{ color }}>{row.movePct >= 0 ? "+" : ""}{row.movePct.toFixed(2)}%</span>
            <span className="text-[12px] leading-[1.4] text-[#bcbcc2]">{reason}</span>
          </div>
        );
      })}
    </div>
  );
}

function TrajectoryChart({ rows, startPrice, history, currency }: { rows: MoveRow[]; startPrice: number; history: Array<{ date: string; close: number }>; currency: string }) {
  const historyData = history.slice(-100).map((point, index) => ({
    index,
    label: point.date,
    actualPrice: point.close,
    forecastPrice: null as number | null,
    direction: "FLAT" as MoveDirection,
  }));
  const startIndex = historyData.length ? historyData.length - 1 : 0;
  const bridgePrice = historyData.at(-1)?.actualPrice ?? startPrice;
  const bridge = { index: startIndex, label: "Today", actualPrice: bridgePrice, forecastPrice: bridgePrice, direction: "FLAT" as MoveDirection };
  const forecast = rows.map((row) => ({ index: startIndex + row.i, label: `M${row.i}`, actualPrice: null as number | null, forecastPrice: row.target, direction: row.direction }));
  const data = historyData.length ? [...historyData.slice(0, -1), bridge, ...forecast] : [bridge, ...forecast];
  const domain = paddedDomain(data.flatMap((point) => [point.actualPrice, point.forecastPrice]).filter((value): value is number => typeof value === "number"), 0.12);

  return (
    <div className="h-[230px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="huntHistoryFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3ecf8e" stopOpacity={0.14} /><stop offset="100%" stopColor="#3ecf8e" stopOpacity={0.02} /></linearGradient>
            <linearGradient id="huntForecastFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#74a4ff" stopOpacity={0.12} /><stop offset="100%" stopColor="#74a4ff" stopOpacity={0.01} /></linearGradient>
          </defs>
          <CartesianGrid stroke="#1f1f24" strokeDasharray="2 6" />
          <XAxis hide dataKey="label" />
          <YAxis hide domain={domain} />
          <Tooltip
            cursor={{ stroke: "#c77dff", strokeWidth: 1, strokeDasharray: "3 4", strokeOpacity: 0.55 }}
            content={
              <PremiumChartTooltip
                currency={currency}
                labels={{
                  actualPrice: "Actual",
                  forecastPrice: "Forecast",
                }}
                getExtraRows={(point) => {
                  const direction = point?.direction as MoveDirection | undefined;
                  const moveLabel = typeof point?.index === "number" && point.index > startIndex ? `Move #${point.index - startIndex}` : "History";
                  return [
                    ["Track", moveLabel, "#8c8c95"],
                    direction ? ["Direction", direction, directionColor(direction)] : null,
                  ];
                }}
              />
            }
          />
          <Area type="monotone" dataKey="actualPrice" stroke="none" fill="url(#huntHistoryFill)" connectNulls={false} isAnimationActive={false} />
          <Area type="monotone" dataKey="forecastPrice" stroke="none" fill="url(#huntForecastFill)" connectNulls={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="actualPrice" name="Actual" stroke="#3ecf8e" strokeOpacity={0.72} strokeWidth={2} dot={false} activeDot={{ r: 5, fill: "#3ecf8e", stroke: "#0d0f11", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="forecastPrice" name="Forecast" stroke="#74a4ff" strokeWidth={2.5} strokeDasharray="7 5" dot={{ r: 2.75, fill: "#74a4ff", stroke: "#0d0f11", strokeWidth: 1.5 }} activeDot={{ r: 5, fill: "#c77dff", stroke: "#0d0f11", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
          <ReferenceLine x="Today" stroke="#8c8c95" strokeDasharray="3 4" strokeOpacity={0.45} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: color }} />{label}</span>;
}
