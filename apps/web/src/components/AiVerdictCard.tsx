import type { StockAnalysisResponse } from "../lib/api";
import { formatPercent } from "../lib/format";
import { Ring } from "../lib/ring";
import { AgentByline, AgentSignoff } from "./agents/AgentByline";
import { AgentRecap } from "./agents/AgentRecap";
import { PremiumAiButton } from "./PremiumAiButton";

const TONE_COLOR: Record<string, string> = { good: "#3ecf8e", warn: "#f5c451", bad: "#f2575c" };
const TONE_BG: Record<string, string> = { good: "rgba(62,207,142,0.07)", warn: "rgba(245,196,81,0.07)", bad: "rgba(242,87,92,0.07)" };
const TONE_BORDER: Record<string, string> = { good: "rgba(62,207,142,0.4)", warn: "rgba(245,196,81,0.4)", bad: "rgba(242,87,92,0.4)" };
const scoreColor = (score: number) => (score >= 75 ? "#3ecf8e" : score >= 55 ? "#f5c451" : "#f2575c");

function generatedText(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return ` · generated ${date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

function PriceBanner({
  target,
  entry,
  tone,
  currency = "USD",
}: {
  target?: StockAnalysisResponse["targetPrice"];
  entry?: StockAnalysisResponse["entryPrice"];
  tone: StockAnalysisResponse["tone"];
  currency?: string;
}) {
  const upside = target?.impliedUpsidePct;
  const upColor = typeof upside === "number" ? (upside >= 0 ? "#3ecf8e" : "#f2575c") : (TONE_COLOR[tone ?? "warn"] ?? "#f5c451");
  const entryDistance = entry?.distanceFromCurrentPct;
  const entryColor = typeof entryDistance === "number" ? (entryDistance <= 0 ? "#3ecf8e" : "#f5c451") : "#74a4ff";

  return (
    <div className="mb-[18px] flex flex-col gap-3.5 rounded-[12px] border border-[#2a2a31] bg-[#0e0e10] px-[18px] py-[14px]">
      {target ? (
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1f1f24] pb-3.5">
          <div className="flex items-center gap-[22px]">
            <div>
              <div className="text-[10px] uppercase tracking-[.5px] text-[#8c8c95]">Now</div>
              <div className="mt-1 font-mono text-xl font-semibold">{formatPrice(target.currentPrice, currency)}</div>
            </div>
            <div className="text-lg text-[#5a5a62]">→</div>
            <div>
              <div className="text-[10px] uppercase tracking-[.5px] text-[#8c8c95]">AI target · {target.timeHorizon}</div>
              <div className="mt-1 font-mono text-xl font-semibold" style={{ color: upColor }}>{formatPrice(target.targetPrice, currency)}</div>
            </div>
          </div>
          {typeof upside === "number" ? (
            <div className="text-right">
              <div className="font-mono text-2xl font-bold" style={{ color: upColor }}>{formatPercent(upside)}</div>
              <div className="text-[10px] uppercase tracking-[.5px] text-[#8c8c95]">implied {upside >= 0 ? "upside" : "downside"}</div>
            </div>
          ) : null}
          <p className="w-full text-xs leading-[1.5] text-[#8c8c95]">{target.basis}</p>
        </div>
      ) : null}

      {entry ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[.5px] text-[#8c8c95]">Suggested entry price</div>
            <div className="mt-1 font-mono text-xl font-semibold" style={{ color: entryColor }}>{formatPrice(entry.entryPrice, currency)}</div>
          </div>
          {typeof entryDistance === "number" ? (
            <div className="text-right">
              <div className="font-mono text-lg font-bold" style={{ color: entryColor }}>{formatPercent(entryDistance)}</div>
              <div className="text-[10px] uppercase tracking-[.5px] text-[#8c8c95]">vs. current price</div>
            </div>
          ) : null}
          <p className="w-full text-xs leading-[1.5] text-[#8c8c95]"><span className="text-[#8c8c95]">Why: </span>{entry.why}</p>
        </div>
      ) : null}
    </div>
  );
}

export function AiVerdictCard({
  value,
  onRerun,
  size = "modal",
  currency = "USD",
  accent = "tone",
  bylineLabel,
  showSignoff = true,
}: {
  value: StockAnalysisResponse;
  onRerun?: () => void;
  size?: "modal" | "panel";
  currency?: string;
  accent?: "tone" | "agent";
  bylineLabel?: string;
  showSignoff?: boolean;
}) {
  const tone = value.tone ?? "warn";
  const color = accent === "agent" && value.agent?.color ? value.agent.color : (TONE_COLOR[tone] ?? "#f5c451");
  const borderColor = accent === "agent" ? `${color}58` : TONE_BORDER[tone];
  const background = accent === "agent"
    ? `radial-gradient(circle at 4% 0%, ${color}24, transparent 33%), radial-gradient(circle at 92% 8%, ${color}1a, transparent 30%), linear-gradient(135deg, ${color}10, rgba(19,19,23,0.88) 58%, rgba(14,14,16,0.98))`
    : TONE_BG[tone];
  const ringSize = size === "modal" ? 88 : 74;

  return (
    <div
      className="rounded-[14px] p-5"
      style={{ border: `1px solid ${borderColor}`, background }}
    >
      <AgentByline agent={value.agent} label={bylineLabel} />
      {value.targetPrice || value.entryPrice ? <PriceBanner target={value.targetPrice} entry={value.entryPrice} tone={value.tone} currency={currency} /> : null}

      <div className="flex flex-wrap items-center gap-5">
        {typeof value.confidence === "number" ? (
          <div className="relative flex-none" style={{ width: ringSize, height: ringSize }}>
            <Ring score={value.confidence} color={color} size={ringSize} stroke={8} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-2xl font-semibold leading-none" style={{ color }}>
                {value.confidence}
              </span>
              <span className="mt-0.5 text-[9px] text-[#8c8c95]">AI score</span>
            </div>
          </div>
        ) : null}
        <div className="min-w-[200px] flex-1">
          <span
            className="inline-block rounded-lg border-[1.5px] px-[11px] py-[5px] font-mono text-[13px] font-bold tracking-[.6px]"
            style={{ color, borderColor: color }}
          >
            {value.signal}
          </span>
          <div className="mt-[11px] text-[19px] font-bold leading-tight tracking-[-.3px]">{value.headline}</div>
          <p className="mt-[7px] text-[13.5px] leading-[1.55] text-[#bcbcc2]">{value.summary}</p>
        </div>
      </div>

      {value.targetPrice ? (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <TargetCell label="Target price" value={formatPrice(value.targetPrice.targetPrice, currency)} color={color} />
          <TargetCell label="Implied move" value={formatMove(value.targetPrice.impliedUpsidePct)} color={moveColor(value.targetPrice.impliedUpsidePct)} />
          <TargetCell label="Time horizon" value={value.targetPrice.timeHorizon} color="#ececee" />
        </div>
      ) : null}

      {value.scores?.length ? (
        <div className="mt-[18px] flex flex-col gap-[9px]">
          <div className="text-[11px] uppercase tracking-[.5px] text-[#8c8c95]">AI scorecard · 0-100</div>
          {value.scores.map((entry) => {
            const ringColor = scoreColor(entry.score);
            return (
              <div key={entry.label} className="flex items-center gap-3.5 rounded-[10px] border border-[#2a2a31] bg-[#0e0e10] px-3.5 py-3">
                <div className="relative flex-none" style={{ width: 54, height: 54 }}>
                  <Ring score={entry.score} color={ringColor} size={54} stroke={6} />
                  <div
                    className="absolute inset-0 flex items-center justify-center font-mono text-[15px] font-semibold"
                    style={{ color: ringColor }}
                  >
                    {entry.score}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-semibold">{entry.label}</div>
                  <div className="mt-0.5 text-xs leading-[1.5] text-[#8c8c95]">{entry.why}</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {value.bullets?.length ? (
        <div className="mt-4 flex flex-col gap-2">
          {value.bullets.map((bullet, index) => (
            <div key={index} className="flex gap-2.5 text-[13px] leading-[1.55] text-[#cfcfd4]">
              <span className="mt-px" style={{ color }}>●</span>
              <span>{bullet}</span>
            </div>
          ))}
        </div>
      ) : null}

      {onRerun ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] text-[#5a5a62]">{value.source === "openai" ? `OpenAI · ${value.model ?? "configured model"}` : "AI-generated on request"}{generatedText(value.generatedAt)} · not financial advice</span>
          <PremiumAiButton label="Re-run" sublabel="AI" onClick={onRerun} size="xs" />
        </div>
      ) : null}
      <AgentRecap agent={value.agent} recap={value.recap} fit={value.agentFit} reason={value.agentFitReason} />
      {showSignoff ? <AgentSignoff agent={value.agent} /> : null}
    </div>
  );
}

function TargetCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-[10px] border border-[#2a2a31] bg-[#0e0e10] px-3.5 py-3">
      <div className="text-[11px] uppercase tracking-[0.5px] text-[#8c8c95]">{label}</div>
      <div className="mt-1.5 font-mono text-[18px] font-semibold" style={{ color }}>{value}</div>
    </div>
  );
}

function formatPrice(value?: number | null, currency = "USD") {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: value >= 100 ? 0 : 2 }).format(value);
}

function formatMove(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function moveColor(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "#ececee";
  return value >= 0 ? "#3ecf8e" : "#f2575c";
}
