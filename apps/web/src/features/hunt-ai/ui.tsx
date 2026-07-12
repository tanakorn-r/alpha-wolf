import { LoadingSpinner } from "../../components/LoadingSpinner";
import { AgentThinking } from "../../components/agents/AgentThinking";

export const panel = "rounded-[var(--aw-radius-card)] border border-[var(--aw-border)] bg-[var(--aw-surface)]";

type ProgressStep = {
  label: string;
  sub: string;
};

export type LoadingTask = "analyst" | "valuation" | "forecast" | "strategy" | "portfolio" | "intraday" | "deep" | "timing";

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
    if (task === "timing") return `Kai is mapping when to send ${target}`;
  }
  if (task === "analyst" || task === "deep") return `${name} is analyzing ${target}`;
  if (task === "valuation") return `${name} is checking ${target}'s price discipline`;
  if (task === "forecast") return `${name} is forecasting the next 10 days for ${target}`;
  if (task === "strategy") return `${name} is building the strategy playbook`;
  if (task === "portfolio") return `${name} is reviewing your portfolio`;
  if (task === "intraday") return `${name} is reading the tape on ${target}`;
  if (task === "timing") return `${name} is building ${target}'s buy timing plan`;
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

export function PremiumLoading({ title, subject, steps, agentId, task, onClose }: { title: string; subject?: string; steps?: ProgressStep[]; agentId?: string; task?: LoadingTask; onClose?: () => void }) {
  const accent = ({ vera: "#74a4ff", rex: "#f5c451", nadia: "#c77dff", sam: "#3ecf8e", kai: "#ff6bcb", ben: "#d6b36a", alphawolf: "#3ecf8e" } as Record<string, string>)[agentId ?? ""] ?? "#3ecf8e";
  return <AgentThinking title={title} subtitle={agentLoadingSubtitle(agentId)} marker={compactMarker(subject || compactSubject(title))} accent={accent} steps={agentSteps(steps ?? loadingStepsFor(title), agentId, task)} workingLabel={agentId === "kai" ? "COOKING" : "WORKING"} onClose={onClose} />;
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
  if (lower.includes("buy timing") || lower.includes("timing plan")) {
    return [
      { label: "Pulling five-year monthly closes", sub: "actual prices · seasonal returns" },
      { label: "Reading dividend rhythm", sub: "ex-dates · post-ex behavior · recovery" },
      { label: "Checking current price context", sub: "entry band · five-year range" },
      { label: "Sizing monthly actions", sub: "buy budget · hold · trim percentage" },
      { label: "Asking the selected Agent", sub: "persona method · horizon · risk rule" },
      { label: "Rendering the timing plan", sub: "12 months · backtest · decision gates" },
    ];
  }
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
