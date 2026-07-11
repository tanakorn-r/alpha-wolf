import type { StockDetailResponse, UpwardMove } from "../../lib/api";
import { formatCurrency } from "../../lib/format";

export type HuntTab = "signals" | "brief" | "timing" | "replay" | "intraday" | "n100" | "strategy" | "analyst";
export type N100Timeframe = "1D" | "1W";
export type StratMode = "swing" | "day" | "long" | "value" | "fomo";
export type MoveDirection = "UP" | "DOWN" | "FLAT";
export type MoveRow = { i: number; entry: number; target: number; movePct: number; direction: MoveDirection; phase?: string; reason?: string; conf: number };

export const STRAT_CARDS: Array<{ key: StratMode; label: string; subtitle: string; color: string; apiMode: string }> = [
  { key: "swing", label: "Swing Trade", subtitle: "Support turn", color: "#3ecf8e", apiMode: "momentum" },
  { key: "day", label: "Day Trade", subtitle: "In & out same day", color: "#f2575c", apiMode: "momentum" },
  { key: "long", label: "Long-Term", subtitle: "Multi-year compound", color: "#74a4ff", apiMode: "stable_dca" },
  { key: "value", label: "Value / Capital", subtitle: "Below intrinsic value", color: "#f5c451", apiMode: "capitalized" },
  { key: "fomo", label: "FOMO / Momentum", subtitle: "Chase breakouts", color: "#c77dff", apiMode: "momentum" },
];

export const timeframes = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"] as const;
export const realTimeframes = new Set(["1D", "1W"]);
export const windowLabel: Record<string, string> = { "1D": "1-3 days", "1W": "1-3 weeks" };

export function buildTechnicalChartData(detail?: StockDetailResponse) {
  const history = detail?.history ?? [];
  const closes = history.map((point) => point.close);
  return history.map((point, index) => {
    const ma10Window = closes.slice(Math.max(0, index - 9), index + 1);
    const bbWindow = closes.slice(Math.max(0, index - 19), index + 1);
    const vwapWindow = closes.slice(Math.max(0, index - 19), index + 1);
    const mean = bbWindow.length ? avg(bbWindow) : null;
    const sd = mean != null ? Math.sqrt(avg(bbWindow.map((value) => (value - mean) ** 2))) : null;
    return {
      label: point.date,
      close: point.close,
      ma10: ma10Window.length === 10 ? avg(ma10Window) : null,
      vwap: vwapWindow.length ? avg(vwapWindow) : null,
      bbUpper: bbWindow.length === 20 && mean != null && sd != null ? mean + 2 * sd : null,
      bbLower: bbWindow.length === 20 && mean != null && sd != null ? mean - 2 * sd : null,
    };
  }).slice(-60);
}

export function buildTrajectory(currentPrice: number, moves: UpwardMove[]): MoveRow[] {
  let price = currentPrice;
  return moves.map((move, index) => {
    const entry = price;
    const target = entry * (1 + move.movePct / 100);
    price = target;
    return {
      i: index + 1,
      entry,
      target,
      movePct: move.movePct,
      direction: (move.direction as MoveDirection | undefined) ?? directionFromPct(move.movePct),
      phase: move.phase,
      reason: move.reason,
      conf: move.confidence,
    };
  });
}

export function directionFromPct(pct: number): MoveDirection {
  if (pct > 0.08) return "UP";
  if (pct < -0.08) return "DOWN";
  return "FLAT";
}

export function directionColor(direction: MoveDirection) {
  if (direction === "UP") return "#3ecf8e";
  if (direction === "DOWN") return "#f2575c";
  return "#f5c451";
}

export function phaseLabel(row: MoveRow) {
  return row.phase ? row.phase.replace(/_/g, " ") : row.direction.toLowerCase();
}

export function avg(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function confidenceLabel(value: number) {
  if (value >= 80) return "Strong";
  if (value >= 60) return "Useful";
  if (value >= 40) return "Mixed";
  return "Weak";
}

export function colorForTone(tone?: "good" | "warn" | "bad") {
  if (tone === "good") return "#3ecf8e";
  if (tone === "bad") return "#f2575c";
  return "#f5c451";
}

export function signalLevel(score: number | null | undefined, fallback?: string) {
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return { label: normalizeSignal(fallback || "WATCH"), tone: "warn" as const, color: "#f5c451" };
  }
  if (score >= 82) return { label: "STRONG BUY", tone: "good" as const, color: "#3ecf8e" };
  if (score >= 68) return { label: "BUY", tone: "good" as const, color: "#3ecf8e" };
  if (score >= 55) return { label: "ACCUMULATE", tone: "warn" as const, color: "#f5c451" };
  if (score >= 40) return { label: "WATCH", tone: "warn" as const, color: "#f5c451" };
  return { label: "PASS", tone: "bad" as const, color: "#f2575c" };
}

export function toneFromSignal(signal: string, fallback: string) {
  const text = signal.toLowerCase();
  if (text.includes("buy")) return "#3ecf8e";
  if (text.includes("sell") || text.includes("avoid")) return "#f2575c";
  if (text.includes("hold") || text.includes("wait")) return "#f5c451";
  return fallback || "#8c8c95";
}

export function normalizeSignal(signal: string) {
  const text = signal.toUpperCase();
  if (text === "BUY ZONE") return "BUY MORE";
  return text;
}

export function compact(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length).trim()}...` : value;
}

export function moneyMaybe(value: number | null | undefined, currency: string) {
  return typeof value === "number" && Number.isFinite(value) ? formatCurrency(value, currency) : "—";
}

export function stopFromEntry(entry: number | null | undefined) {
  return typeof entry === "number" ? entry * 0.985 : undefined;
}

export function formatAnalyzedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "from cache";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatBacktradeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatCompact(value: number, currency: string): string {
  const prefix = currency === "THB" ? "฿" : "$";
  if (value >= 1e12) return `${prefix}${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `${prefix}${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${prefix}${(value / 1e6).toFixed(1)}M`;
  return `${prefix}${value.toLocaleString()}`;
}
