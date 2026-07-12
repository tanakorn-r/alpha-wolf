import type { StockAnalysisResponse } from "../lib/api";
import { Ring } from "../lib/ring";
import { AgentCall, type AgentCallMetric } from "./agents/AgentCall";
import { AgentRecap } from "./agents/AgentRecap";

const scoreColor = (score: number) => (score >= 75 ? "#3ecf8e" : score >= 55 ? "#f5c451" : "#f2575c");

function generatedText(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return ` · generated ${date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

export function AiVerdictCard({
  value,
  onRerun,
  currency = "USD",
  bylineLabel,
  showSignoff = true,
}: {
  value: StockAnalysisResponse;
  onRerun?: () => void;
  size?: "modal" | "panel";
  currency?: string;
  bylineLabel?: string;
  showSignoff?: boolean;
}) {
  const color = value.agent?.color ?? "#3ecf8e";
  const metrics: AgentCallMetric[] = [];
  if (value.targetPrice) {
    metrics.push(
      { label: "Target price", value: formatPrice(value.targetPrice.targetPrice, currency), color },
      { label: "Implied move", value: formatMove(value.targetPrice.impliedUpsidePct), color: moveColor(value.targetPrice.impliedUpsidePct) },
      { label: "Time horizon", value: value.targetPrice.timeHorizon },
    );
  }
  if (value.entryPrice) metrics.push({ label: "Suggested entry", value: formatPrice(value.entryPrice.entryPrice, currency), note: value.entryPrice.why, color: "#f5c451" });

  return (
    <AgentCall
      agent={value.agent}
      label={bylineLabel ?? "Agent analysis"}
      score={value.confidence}
      scoreLabel="Agent view"
      signal={value.signal}
      headline={value.headline}
      summary={value.summary}
      metrics={metrics}
      bullets={value.bullets ?? []}
      accent={color}
      meta={`${value.source === "openai" ? `OpenAI · ${value.model ?? "configured model"}` : "AI-generated on request"}${generatedText(value.generatedAt)} · not financial advice`}
      onRerun={onRerun}
      signoff={showSignoff ? undefined : false}
    >
      {value.scores?.length ? (
        <div className="mt-[18px] flex flex-col gap-[9px]">
          <div className="text-[11px] uppercase tracking-[.5px] text-[#8c8c95]">AI scorecard · 0-100</div>
          {value.scores.map((entry) => {
            const score = typeof entry.score === "number" ? entry.score : null;
            const ringColor = score !== null ? scoreColor(score) : "#5a5a62";
            return (
              <div key={entry.label} className="flex items-center gap-3.5 rounded-[10px] border border-[#2a2a31] bg-[#0e0e10] px-3.5 py-3">
                <div className="relative flex-none" style={{ width: 54, height: 54 }}>
                  {score !== null ? <Ring score={score} color={ringColor} size={54} stroke={6} /> : null}
                  <div
                    className="absolute inset-0 flex items-center justify-center font-mono text-[15px] font-semibold"
                    style={{ color: ringColor }}
                  >
                    {entry.score ?? "N/A"}
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
      <AgentRecap agent={value.agent} recap={value.recap} fit={value.agentFit} reason={value.agentFitReason} />
    </AgentCall>
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
