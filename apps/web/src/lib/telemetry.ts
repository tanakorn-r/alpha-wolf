export type FlowOutcome = "success" | "failure" | "abandoned";

type OperationalEvent = {
  name: string;
  dimension?: string;
  outcome?: string;
  method?: string;
  status?: number;
  durationMs?: number;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";
const TELEMETRY_ENDPOINT = `${API_BASE.replace(/\/+$/, "")}/telemetry`;
const FLUSH_DELAY_MS = 1_500;
const MAX_BATCH_SIZE = 25;
const SUCCESS_EVENTS = new Set([
  "success_dashboard_opened",
  "success_account_connected",
  "success_pro_trial_activated",
  "success_credits_purchased",
  "success_support_request_sent",
  "success_watchlist_changed",
  "success_portfolio_changed",
  "success_dca_plan_changed",
  "success_ai_analysis_returned",
  "success_strategy_returned",
  "success_replay_started",
  "success_onboarding_completed",
]);
const FLOWS = new Set([
  "hunt_signals",
  "buy_timing",
  "next_10",
  "technical_analysis",
  "intraday_analysis",
  "strategy_analysis",
  "analyst_report",
  "ai_replay",
]);
const PAGE_BY_PATH: Record<string, string> = {
  "/": "home",
  "/terms": "terms",
  "/privacy": "privacy",
  "/refunds": "refunds",
  "/support": "support",
  "/daily-brief": "daily_brief",
  "/live-trade": "live_trade",
  "/scanner": "scanner",
  "/discover": "scanner",
  "/hunt-ai": "hunt_ai",
  "/deep-ai": "hunt_ai",
  "/day-trader": "hunt_ai",
  "/calendar": "calendar",
};

const flowStarts = new Map<string, number>();
const queue: OperationalEvent[] = [];
let flushTimer: number | null = null;
let initialized = false;
let navigationMetricsRecorded = false;

function telemetryAvailable() {
  return import.meta.env.PROD && typeof window !== "undefined" && (window.location.protocol === "https:" || window.location.protocol === "http:");
}

export function initializeTelemetry() {
  if (!telemetryAvailable() || initialized) return;
  initialized = true;
  recordNavigationMetrics();
  window.addEventListener("pagehide", () => flushTelemetry(true));
}

export function trackPage(path: string) {
  const page = PAGE_BY_PATH[normalizePath(path)];
  if (page) enqueue({ name: "page_view", dimension: page });
}

export function trackEvent(name: string) {
  if (SUCCESS_EVENTS.has(name)) enqueue({ name });
}

export function startFlow(name: string) {
  if (!telemetryAvailable() || !FLOWS.has(name)) return;
  flowStarts.set(name, now());
  enqueue({ name: "flow_started", dimension: name });
}

export function finishFlow(name: string, outcome: FlowOutcome) {
  const startedAt = flowStarts.get(name);
  if (startedAt == null || !FLOWS.has(name)) return;
  flowStarts.delete(name);
  enqueue({
    name: "flow_completed",
    dimension: name,
    outcome,
    durationMs: Math.max(0, Math.min(3_600_000, Math.round(now() - startedAt))),
  });
}

export async function trackedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const startedAt = now();
  const method = normalizeMethod(init?.method ?? (input instanceof Request ? input.method : "GET"));
  const request = requestDescriptor(input, method);
  try {
    const response = await fetch(input, init);
    recordRequest(request.area, method, response.ok ? "success" : "failure", response.status, now() - startedAt);
    if (response.ok && response.status !== 202) recordProductOutcome(request.path, method.toUpperCase());
    return response;
  } catch (error) {
    recordRequest(request.area, method, "network_error", 0, now() - startedAt);
    throw error;
  }
}

function enqueue(event: OperationalEvent) {
  if (!telemetryAvailable()) return;
  queue.push(event);
  if (queue.length >= MAX_BATCH_SIZE) flushTelemetry(false);
  else if (flushTimer == null) flushTimer = window.setTimeout(() => flushTelemetry(false), FLUSH_DELAY_MS);
}

function flushTelemetry(keepalive: boolean) {
  if (flushTimer != null) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
  const events = queue.splice(0, MAX_BATCH_SIZE);
  if (!events.length) return;
  // Deliberately omit cookies and referrer data. The payload contains only
  // allowlisted operational dimensions and is aggregated immediately by the API.
  void fetch(TELEMETRY_ENDPOINT, {
    method: "POST",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    cache: "no-store",
    keepalive,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
  }).catch(() => {
    // Telemetry is best-effort and must never interrupt the product.
  });
  if (queue.length && !keepalive) flushTimer = window.setTimeout(() => flushTelemetry(false), 0);
}

function recordNavigationMetrics() {
  if (navigationMetricsRecorded || typeof window === "undefined") return;
  const record = () => {
    if (navigationMetricsRecorded) return;
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (!navigation) return;
    navigationMetricsRecorded = true;
    recordMetric("page_load", navigation.duration);
    recordMetric("ttfb", navigation.responseStart - navigation.startTime);
    recordMetric("dom_interactive", navigation.domInteractive - navigation.startTime);
  };
  if (document.readyState === "complete") window.setTimeout(record, 0);
  else window.addEventListener("load", record, { once: true });
}

function recordMetric(metric: string, rawDurationMs: number) {
  enqueue({
    name: "performance_metric",
    dimension: metric,
    durationMs: Math.max(0, Math.min(3_600_000, Math.round(rawDurationMs))),
  });
}

function recordRequest(area: string, method: string, outcome: string, status: number, rawDurationMs: number) {
  enqueue({
    name: "api_request",
    dimension: area,
    method,
    outcome,
    status,
    durationMs: Math.max(0, Math.min(3_600_000, Math.round(rawDurationMs))),
  });
}

function recordProductOutcome(path: string, method: string) {
  if (method === "POST" && /\/auth\/google$/.test(path)) trackEvent("success_account_connected");
  else if (method === "POST" && path.includes("/auth/redeem-premium")) trackEvent("success_pro_trial_activated");
  else if (method === "POST" && path.includes("/credit-checkout/confirm")) trackEvent("success_credits_purchased");
  else if (method === "POST" && path.includes("/support")) trackEvent("success_support_request_sent");
  else if (method !== "GET" && path.includes("/portfolio/watchlist")) trackEvent("success_watchlist_changed");
  else if (method !== "GET" && path.includes("/portfolio/holdings")) trackEvent("success_portfolio_changed");
  else if (method !== "GET" && path.includes("/portfolio/dca-orders")) trackEvent("success_dca_plan_changed");
  else if (method === "POST" && path.includes("/analysis/")) trackEvent("success_ai_analysis_returned");
  else if (method === "POST" && path.includes("/strategy/recommendations")) trackEvent("success_strategy_returned");
  else if (method === "POST" && path.includes("/backtrade/jobs")) trackEvent("success_replay_started");
  else if (method === "PUT" && path.endsWith("/settings")) trackEvent("success_onboarding_completed");
}

function requestDescriptor(input: RequestInfo | URL, method: string) {
  const raw = input instanceof Request ? input.url : String(input);
  try {
    const url = new URL(raw, window.location.origin);
    const path = url.pathname;
    return { path, area: requestArea(path, method) };
  } catch {
    return { path: "unknown", area: `${method}_other` };
  }
}

function requestArea(path: string, method: string) {
  if (path.includes("/buy-timing")) return "buy_timing";
  if (path.includes("/backtrade")) return "replay";
  if (path.includes("/strategy")) return "strategy";
  if (path.includes("/analysis")) return "analysis";
  if (path.includes("/portfolio")) return "portfolio";
  if (path.includes("/auth")) return "auth";
  if (path.includes("/discover") || path.includes("/scanner")) return "discovery";
  if (path.includes("/details")) return "details";
  if (path.includes("/calendar")) return "calendar";
  if (path.includes("/live-trade")) return "live_trade";
  if (path.includes("/bootstrap")) return "bootstrap";
  return `${method}_other`;
}

function normalizeMethod(method: string) {
  const value = method.toLowerCase();
  if (value === "post" || value === "put" || value === "patch" || value === "delete") return value;
  return "get";
}

function normalizePath(path: string) {
  return path.split("?")[0].replace(/\/+$/, "") || "/";
}

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
