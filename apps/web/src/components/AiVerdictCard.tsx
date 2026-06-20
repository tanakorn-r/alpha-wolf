import type { StockAnalysisResponse } from "../lib/api";
import { Ring } from "../lib/ring";

const TONE_COLOR: Record<string, string> = { good: "#3ecf8e", warn: "#f5c451", bad: "#f2575c" };
const TONE_BG: Record<string, string> = { good: "rgba(62,207,142,0.07)", warn: "rgba(245,196,81,0.07)", bad: "rgba(242,87,92,0.07)" };
const TONE_BORDER: Record<string, string> = { good: "rgba(62,207,142,0.4)", warn: "rgba(245,196,81,0.4)", bad: "rgba(242,87,92,0.4)" };
const scoreColor = (score: number) => (score >= 75 ? "#3ecf8e" : score >= 55 ? "#f5c451" : "#f2575c");

export function AiVerdictCard({
  value,
  onRerun,
  size = "modal",
}: {
  value: StockAnalysisResponse;
  onRerun?: () => void;
  size?: "modal" | "panel";
}) {
  const color = TONE_COLOR[value.tone ?? "warn"] ?? "#f5c451";
  const ringSize = size === "modal" ? 88 : 74;

  return (
    <div
      className="rounded-[14px] p-5"
      style={{ border: `1px solid ${TONE_BORDER[value.tone ?? "warn"]}`, background: TONE_BG[value.tone ?? "warn"] }}
    >
      <div className="flex flex-wrap items-center gap-5">
        {typeof value.confidence === "number" ? (
          <div className="relative flex-none" style={{ width: ringSize, height: ringSize }}>
            <Ring score={value.confidence} color={color} size={ringSize} stroke={8} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-2xl font-semibold leading-none" style={{ color }}>
                {value.confidence}
              </span>
              <span className="mt-0.5 text-[9px] text-[#8c8c95]">conviction</span>
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
          <span className="font-mono text-[11px] text-[#5a5a62]">{value.source === "openai" ? `OpenAI · ${value.model ?? "configured model"}` : "AI-generated on request"} · not financial advice</span>
          <button
            type="button"
            onClick={onRerun}
            className="rounded-lg border border-[#2a2a31] px-3 py-[7px] text-xs text-[#8c8c95] hover:border-[#3ecf8e]"
          >
            Re-run
          </button>
        </div>
      ) : null}
    </div>
  );
}
