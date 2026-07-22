export type ActionPositionHints = {
  tone?: "good" | "warn" | "bad" | null;
  directionalPct?: number | null;
  actionScore?: number | null;
};

export function actionPositionFromSignal(
  signal: string | null | undefined,
  confidence: number | null | undefined,
  hints: ActionPositionHints = {},
) {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return null;

  const strength = Math.max(0, Math.min(100, confidence)) / 2;
  const normalized = (signal ?? "").trim().toUpperCase().replace(/[_-]+/g, " ");
  const isNeutralAction = ["HOLD", "WAIT", "OBSERVE", "WATCH", "NO ACTION"]
    .some((word) => normalized === word || normalized.startsWith(`${word} `));
  // Confidence answers "how sure is the Agent?"; it must not turn an explicit
  // HOLD/WAIT decision into a visual BUY recommendation.
  if (isNeutralAction) return 50;

  const isNegative = ["SELL", "TRIM", "REDUCE", "AVOID", "PASS", "BEARISH", "STAND ASIDE", "NO BUY"]
    .some((word) => normalized.includes(word));
  if (isNegative) return 50 - strength;

  const isPositive = ["BUY", "ACCUMULATE", "ADD", "BULLISH", "FAVORABLE"]
    .some((word) => normalized.includes(word));
  if (isPositive) return 50 + strength;

  if (typeof hints.directionalPct === "number" && Number.isFinite(hints.directionalPct) && Math.abs(hints.directionalPct) >= 0.5) {
    const evidenceMove = Math.min(24, 7 + Math.abs(hints.directionalPct) * 1.15);
    const confidenceWeight = 0.65 + Math.max(0, Math.min(100, confidence)) * 0.0035;
    return 50 + Math.sign(hints.directionalPct) * evidenceMove * confidenceWeight;
  }

  if (typeof hints.actionScore === "number" && Number.isFinite(hints.actionScore)) {
    return Math.max(0, Math.min(100, hints.actionScore));
  }

  if (hints.tone === "good") return 50 + strength * 0.55;
  if (hints.tone === "bad") return 50 - strength * 0.55;
  return 50;
}

export function actionPositionLabel(score: number) {
  if (score >= 75) return "Buy";
  if (score >= 55) return "Near buy";
  if (score > 45) return "Hold / wait";
  if (score > 25) return "Near sell";
  return "Sell / avoid";
}

export function actionPositionTone(score: number) {
  if (score >= 55) return "#3ecf8e";
  if (score <= 45) return "#f2575c";
  return "#f5c451";
}
