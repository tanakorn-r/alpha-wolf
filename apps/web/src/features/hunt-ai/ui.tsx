import { useEffect, useMemo, useState } from "react";
import { LoadingSpinner } from "../../components/LoadingSpinner";

export const panel = "rounded-[10px] border border-[#2a2a31] bg-[#161619]";

type ProgressStep = {
  label: string;
  sub: string;
};

export type LoadingTask = "analyst" | "valuation" | "forecast" | "strategy" | "portfolio" | "intraday" | "deep";

const AGENT_NAMES: Record<string, string> = {
  vera: "Vera",
  rex: "Rex",
  nadia: "Nadia",
  sam: "Sam",
  kai: "Kai",
  ben: "Ben",
  alphawolf: "AlphaWolf Prime",
};

export function agentName(agentId?: string) {
  return AGENT_NAMES[agentId || ""] ?? "Your Agent";
}

export function agentLoadingTitle(agentId: string | undefined, task: LoadingTask, subject?: string) {
  const name = agentName(agentId);
  const target = subject || "this setup";
  if (agentId === "kai") {
    if (task === "analyst" || task === "deep") return `Kai is vibe-checking ${target}`;
    if (task === "valuation") return `Kai is checking if ${target} is chase bait`;
    if (task === "forecast") return `Kai is simming the next 10 candles for ${target}`;
    if (task === "strategy") return "Kai is hunting the spiciest setups";
    if (task === "portfolio") return "Kai is checking if your portfolio is cooked";
    if (task === "intraday") return `Kai is reading the tape on ${target}`;
  }
  if (task === "analyst" || task === "deep") return `${name} is analyzing ${target}`;
  if (task === "valuation") return `${name} is checking ${target}'s price discipline`;
  if (task === "forecast") return `${name} is forecasting the next 10 days for ${target}`;
  if (task === "strategy") return `${name} is building the strategy playbook`;
  if (task === "portfolio") return `${name} is reviewing your portfolio`;
  if (task === "intraday") return `${name} is reading the tape on ${target}`;
  return `${name} is working`;
}

function agentLoadingSubtitle(agentId?: string) {
  if (agentId === "kai") return "Quick vibe check, hard stops, no diamond-hands cosplay.";
  if (agentId === "rex") return "Reading tape, timing, stops, and position size.";
  if (agentId === "nadia") return "Running the factor lens without emotional noise.";
  if (agentId === "sam") return "Checking income durability and long-term patience.";
  if (agentId === "ben") return "Studying the business structure before the price noise.";
  if (agentId === "alphawolf") return "Checking every corner: price, structure, timing, income, and risk.";
  return "Running your private model — this takes a few seconds.";
}

export function SpinnerOrb() {
  return (
    <div className="mx-auto mb-3 flex justify-center">
      <LoadingSpinner size={22} className="text-[#3ecf8e]" />
    </div>
  );
}

export function PremiumLoading({ title, subject, steps, agentId, task }: { title: string; subject?: string; steps?: ProgressStep[]; agentId?: string; task?: LoadingTask }) {
  const inferredSteps = useMemo(() => agentSteps(steps ?? loadingStepsFor(title), agentId, task), [agentId, steps, task, title]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setTick(0);
    const timer = window.setInterval(() => {
      setTick((current) => current + 1);
    }, 900);
    return () => window.clearInterval(timer);
  }, [title]);

  const stepIndex = Math.min(inferredSteps.length - 1, Math.floor(tick / 3));
  const percent = Math.min(89, Math.round(6 + (1 - Math.exp(-tick / 11)) * 83));
  const marker = compactMarker(subject || compactSubject(title));

  return (
    <div className={`${panel} relative overflow-hidden bg-[linear-gradient(180deg,#17171b,#131316)] px-5 py-5 max-[680px]:px-4`}>
      <div className="pointer-events-none absolute -right-10 -top-12 h-[150px] w-[150px] rounded-full bg-[#3ecf8e]/[0.08] blur-[18px]" />

      <div className="relative mb-4 flex items-center gap-3.5">
        <div className="relative h-11 w-11 flex-none">
          <div className="absolute inset-0 rounded-full border-[2.5px] border-transparent border-t-[#3ecf8e] animate-spin" />
          <div className="absolute inset-[6px] rounded-full border-2 border-transparent border-t-[#4d96ff] animate-[spin_1.3s_linear_infinite_reverse]" />
          <div className="absolute inset-[12px] rounded-full border-2 border-transparent border-t-[#c77dff] animate-spin" />
          <div className="absolute inset-0 grid place-items-center px-1 text-center font-mono text-[11px] font-extrabold leading-none text-[#ececee]">{marker}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold tracking-[-0.2px] text-[#ececee]">{title}</div>
          <div className="mt-[2px] text-[12px] text-[#8c8c95]">{agentLoadingSubtitle(agentId)}</div>
        </div>
        <div className="flex-none font-mono text-[18px] font-extrabold text-[#3ecf8e]">{percent}%</div>
      </div>

      <div className="mb-4 h-1 overflow-hidden rounded-full bg-[#232329]">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,#3ecf8e,#4d96ff,#3ecf8e)] bg-[length:200%_100%] transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex flex-col gap-0.5">
        {inferredSteps.map((step, index) => {
          const done = index < stepIndex;
          const active = index === stepIndex;
          const pending = index > stepIndex;
          return (
            <div key={step.label} className="flex items-center gap-3 px-1 py-[6px]">
              <div className="grid h-[18px] w-[18px] flex-none place-items-center">
                {done ? (
                  <div className="grid h-[18px] w-[18px] place-items-center rounded-full bg-[#3ecf8e]">
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.2l2.4 2.4L9.6 3.8" stroke="#06120c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </div>
                ) : null}
                {active ? <div className="h-[9px] w-[9px] animate-pulse rounded-full bg-[#3ecf8e]" /> : null}
                {pending ? <div className="h-2 w-2 rounded-full border-[1.5px] border-[#2a2a31]" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-[12.5px] font-medium transition-colors ${pending ? "text-[#5a5a62]" : "text-[#ececee]"}`}>{step.label}</div>
                {active ? <div className="mt-0.5 font-mono text-[10.5px] text-[#8c8c95]">{step.sub}</div> : null}
              </div>
              {active ? <div className="flex-none animate-pulse font-mono text-[10px] tracking-[0.5px] text-[#3ecf8e]">{agentId === "kai" ? "COOKING" : "WORKING"}</div> : null}
              {done ? <div className="flex-none font-mono text-[10px] tracking-[0.5px] text-[#5a5a62]">DONE</div> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function agentSteps(steps: ProgressStep[], agentId?: string, task?: LoadingTask) {
  if (!agentId || !task) return steps;
  if (agentId === "kai") {
    if (task === "valuation") {
      return [
        { label: "Vibe-checking current price", sub: "is this sendable or already cooked?" },
        { label: "Finding the chase line", sub: "support · resistance · FOMO zone" },
        { label: "Checking rug-pull risk", sub: "downside · stop · bad candles" },
        { label: "Mapping add-back zones", sub: "where to reload without forcing it" },
        { label: "Kai makes the call", sub: "chase mode or cooldown?" },
        { label: "Dropping the Daily Signal", sub: "entry · conviction · exit rule" },
      ];
    }
    if (task === "analyst" || task === "deep") {
      return [
        { label: "Vibe-checking price action", sub: "main-character candle or sleepy tape?" },
        { label: "Checking if fundamentals are cooked", sub: "margins · debt · growth" },
        { label: "Scanning the headline energy", sub: "news · catalyst · crowd mood" },
        { label: "Comparing the crowd", sub: "benchmark · peers · relative heat" },
        { label: "Kai scores the setup", sub: "send it, wait, or hard pass" },
        { label: "Dropping the Analyst card", sub: "entry · target · stop · no cap" },
      ];
    }
    if (task === "forecast") {
      return [
        { label: "Pulling the chart receipts", sub: "recent moves · volatility · trend" },
        { label: "Checking momentum energy", sub: "RSI · volume · breakout heat" },
        { label: "Finding cooldown risk", sub: "failed moves · overextension" },
        { label: "Running the candle sim", sub: "possible paths · not destiny" },
        { label: "Marking take-the-bag zones", sub: "trim points · invalidation" },
        { label: "Rendering the next-10 map", sub: "fast read · risk first" },
      ];
    }
  }
  const name = agentName(agentId);
  return steps.map((step) => step.label === "Asking the active Agent" || step.label === "Scoring the Agent lens" || step.label === "Writing the Agent playbook"
    ? { ...step, label: `${name} is making the call` }
    : step);
}

export function ChartLoading({ label }: { label: string }) {
  return <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-[#8c8c95]"><LoadingSpinner size={22} className="text-[#3ecf8e]" />{label}</div>;
}

export function LoadingRow({ label }: { label: string }) {
  return <div className="flex items-center gap-2 border-t border-[#1a1a1e] px-3.5 py-3 text-[12px] text-[#8c8c95]"><LoadingSpinner size={12} />{label}</div>;
}

export function EmptyStrip({ label }: { label: string }) {
  return <div className="px-3.5 py-4 text-center text-[12px] text-[#8c8c95]">{label}</div>;
}

function compactSubject(title: string) {
  const upper = title.toUpperCase();
  const ticker = upper.match(/\b[A-Z]{2,6}(?:\.[A-Z]{1,3})?\b/)?.[0];
  if (ticker && !["AI", "THE"].includes(ticker)) return ticker;
  return "AI";
}

function compactMarker(value: string) {
  const clean = value.trim().toUpperCase();
  if (!clean || clean === "THE") return "AI";
  const base = clean.split(".")[0].replace(/[^A-Z0-9]/g, "");
  if (!base) return "AI";
  if (base.length <= 4) return base;
  return base.slice(0, 2);
}

function loadingStepsFor(title: string): ProgressStep[] {
  const lower = title.toLowerCase();
  if (lower.includes("forecast") || lower.includes("next 10")) {
    return [
      { label: "Pulling 5-year price history", sub: "1,260 trading days" },
      { label: "Reading the dividend calendar", sub: "ex-dates · yield · payout streak" },
      { label: "Measuring momentum & RSI", sub: "14-day · 50/200-day cross" },
      { label: "Cross-referencing macro signals", sub: "rates · sector flows · volatility" },
      { label: "Running 10-day Monte Carlo", sub: "10,000 simulated paths" },
      { label: "Rendering your continuation chart", sub: "median path · confidence band" },
    ];
  }
  if (lower.includes("valuation") || lower.includes("chasing")) {
    return [
      { label: "Checking current price", sub: "last trade · daily move · market currency" },
      { label: "Reading value anchors", sub: "book value · P/BV · support floor" },
      { label: "Testing yield quality", sub: "dividend yield · payout · cash coverage" },
      { label: "Mapping add-back zones", sub: "discount anchor · fair anchor · chase line" },
      { label: "Asking the active Agent", sub: "persona lens · risk rules · final verdict" },
      { label: "Rendering Daily Signal", sub: "entry · conviction · the play" },
    ];
  }
  if (lower.includes("strategy") || lower.includes("playbook")) {
    return [
      { label: "Reading your holdings", sub: "weights · cash · active watchlist" },
      { label: "Scoring each strategy lens", sub: "swing · day · long-term · value · momentum" },
      { label: "Checking sector overlap", sub: "concentration · correlation · risk clusters" },
      { label: "Ranking the top setups", sub: "entry · upside · conviction" },
      { label: "Writing the Agent playbook", sub: "tone · rules · next actions" },
      { label: "Rendering strategy cards", sub: "top 5 · risk notes · sign-off" },
    ];
  }
  return [
    { label: "Pulling price action", sub: "history · support · resistance" },
    { label: "Reading fundamentals", sub: "revenue · margins · balance sheet" },
    { label: "Checking dividend and news", sub: "yield · events · recent headlines" },
    { label: "Comparing market context", sub: "benchmark · peer · sector backdrop" },
    { label: "Scoring the Agent lens", sub: "value · health · growth · timing" },
    { label: "Rendering the Analyst card", sub: "signal · entry · target · reasons" },
  ];
}
