import type { FirebaseApp, FirebaseOptions } from "firebase/app";
import type { Analytics } from "firebase/analytics";
import type { FirebasePerformance, PerformanceTrace } from "firebase/performance";

export type AnalyticsConsent = "granted" | "denied" | "unknown";
export type FlowOutcome = "success" | "failure" | "abandoned";

type AnalyticsUser = { id: string; plan: string; locale?: string };
type ActiveFlow = { startedAt: number; performanceTrace?: PerformanceTrace };
type EventParameters = Record<string, string | number>;
type FirebaseAppSdk = typeof import("firebase/app");
type FirebaseAnalyticsSdk = typeof import("firebase/analytics");
type FirebasePerformanceSdk = typeof import("firebase/performance");

const CONSENT_STORAGE_KEY = "aw_analytics_consent";
const FIREBASE_APP_NAME = "alpha-wolf-analytics";
const firebaseConfig: FirebaseOptions = {
  // Firebase Web App configuration is intentionally public. Environment
  // variables can override it so preview/staging data stays isolated.
  apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY ?? "AIzaSyBbTMdf0jRdv-Jx_Ez9IoErkYRooLIAoPE").trim(),
  authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "alpha-wolf-c16d8.firebaseapp.com").trim(),
  projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "alpha-wolf-c16d8").trim(),
  storageBucket: String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "alpha-wolf-c16d8.firebasestorage.app").trim(),
  messagingSenderId: String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "135073173307").trim(),
  appId: String(import.meta.env.VITE_FIREBASE_APP_ID ?? "1:135073173307:web:fa534ec49b783969f7711e").trim(),
  measurementId: String(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? "G-Z4FZNH88TW").trim(),
};
const flowStarts = new Map<string, ActiveFlow>();

let analytics: Analytics | null = null;
let performanceMonitor: FirebasePerformance | null = null;
let analyticsSdk: FirebaseAnalyticsSdk | null = null;
let performanceSdk: FirebasePerformanceSdk | null = null;
let initialization: Promise<boolean> | null = null;
let started = false;
let navigationMetricsRecorded = false;
let currentPage = "";
let currentUser: AnalyticsUser | null = null;

export function analyticsAvailable() {
  if (!import.meta.env.PROD || typeof window === "undefined") return false;
  const hasRequiredConfig = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId && firebaseConfig.measurementId);
  return hasRequiredConfig && (window.location.protocol === "https:" || window.location.protocol === "http:");
}

export function getAnalyticsConsent(): AnalyticsConsent {
  if (typeof window === "undefined") return "unknown";
  const value = window.localStorage.getItem(CONSENT_STORAGE_KEY);
  return value === "granted" || value === "denied" ? value : "unknown";
}

export function initializeAnalytics(): Promise<boolean> {
  // Never let a payment-return token become analytics page-location data. The
  // billing flow removes it and emits aw:sensitive-url-cleared before startup.
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("session_id")) return Promise.resolve(false);
  if (!analyticsAvailable() || getAnalyticsConsent() !== "granted") return Promise.resolve(false);
  if (started) return Promise.resolve(true);
  if (initialization) return initialization;

  initialization = (async () => {
    try {
      // Firebase stays in lazy chunks so visitors who decline analytics do not
      // download or initialize the SDK at all.
      const [appSdk, loadedAnalyticsSdk, loadedPerformanceSdk] = await Promise.all([
        import("firebase/app"),
        import("firebase/analytics"),
        import("firebase/performance"),
      ]);
      if (!(await loadedAnalyticsSdk.isSupported())) return false;
      const app = getOrCreateFirebaseApp(appSdk);
      analyticsSdk = loadedAnalyticsSdk;
      performanceSdk = loadedPerformanceSdk;
      analytics = analyticsSdk.getAnalytics(app);
      analyticsSdk.setAnalyticsCollectionEnabled(analytics, true);
      performanceMonitor = performanceSdk.getPerformance(app);
      performanceMonitor.dataCollectionEnabled = true;
      performanceMonitor.instrumentationEnabled = true;
      started = true;
      analyticsSdk.setUserProperties(analytics, { app: "alpha-wolf-web", release_mode: normalizeProperty(import.meta.env.MODE) });
      if (currentPage) applyPageContext(currentPage);
      if (currentUser) applyUserContext(currentUser);
      else analyticsSdk.setUserProperties(analytics, { account_state: "signed_out" });
      recordNavigationMetrics();
      return true;
    } catch {
      analytics = null;
      performanceMonitor = null;
      analyticsSdk = null;
      performanceSdk = null;
      return false;
    }
  })();

  return initialization;
}

export function setAnalyticsConsent(consent: Exclude<AnalyticsConsent, "unknown">) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONSENT_STORAGE_KEY, consent);
  if (consent === "granted") {
    void initializeAnalytics().then((enabled) => {
      if (enabled) emitEvent("analytics_consent_granted");
    });
  } else {
    if (analytics && analyticsSdk) analyticsSdk.setAnalyticsCollectionEnabled(analytics, false);
    if (performanceMonitor) {
      performanceMonitor.dataCollectionEnabled = false;
      performanceMonitor.instrumentationEnabled = false;
    }
  }
  window.dispatchEvent(new CustomEvent("aw:analytics-consent", { detail: consent }));
}

export function trackPage(path: string) {
  currentPage = normalizePage(path);
  if (started) applyPageContext(currentPage);
}

export function identifyAnalyticsUser(user: { id: number; plan?: string; locale?: string } | null) {
  currentUser = user ? { id: String(user.id), plan: user.plan ?? "free", locale: user.locale } : null;
  if (!started || !analytics || !analyticsSdk) return;
  if (currentUser) applyUserContext(currentUser);
  else {
    analyticsSdk.setUserId(analytics, null);
    analyticsSdk.setUserProperties(analytics, { account_state: "signed_out" });
  }
}

export function trackEvent(name: string) {
  emitEvent(normalizeEventName(name));
}

export function startFlow(name: string) {
  if (!analyticsAvailable() || getAnalyticsConsent() !== "granted") return;
  const flow = normalizeName(name);
  const active: ActiveFlow = { startedAt: now() };
  if (performanceMonitor && performanceSdk) {
    try {
      active.performanceTrace = performanceSdk.trace(performanceMonitor, `flow_${flow}`.slice(0, 100));
      active.performanceTrace.start();
    } catch {
      active.performanceTrace = undefined;
    }
  }
  flowStarts.set(flow, active);
  emitEvent("flow_started", { flow_name: flow });
}

export function finishFlow(name: string, outcome: FlowOutcome) {
  const flow = normalizeName(name);
  const active = flowStarts.get(flow);
  if (!active) return;
  flowStarts.delete(flow);
  const durationMs = Math.max(0, Math.round(now() - active.startedAt));
  const bucket = durationBucket(durationMs);
  if (active.performanceTrace) {
    try {
      active.performanceTrace.putAttribute("outcome", outcome);
      active.performanceTrace.putMetric("duration_ms", durationMs);
      active.performanceTrace.stop();
    } catch {
      // Analytics must never interrupt a product workflow.
    }
  }
  emitEvent("flow_completed", {
    flow_name: flow,
    outcome,
    duration_ms: durationMs,
    duration_bucket: bucket,
  });
}

export async function trackedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const startedAt = now();
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const request = requestDescriptor(input, method);
  try {
    const response = await fetch(input, init);
    recordRequest(request.area, method, response.ok ? "success" : "failure", response.status, now() - startedAt);
    if (response.ok && response.status !== 202) recordProductOutcome(request.path, method);
    return response;
  } catch (error) {
    recordRequest(request.area, method, "network_error", 0, now() - startedAt);
    throw error;
  }
}

function getOrCreateFirebaseApp(appSdk: FirebaseAppSdk): FirebaseApp {
  return appSdk.getApps().find((app) => app.name === FIREBASE_APP_NAME) ?? appSdk.initializeApp(firebaseConfig, FIREBASE_APP_NAME);
}

function applyPageContext(page: string) {
  if (!analytics || !analyticsSdk || typeof window === "undefined") return;
  analyticsSdk.logEvent(analytics, "page_view", {
    page_title: page,
    page_location: `${window.location.origin}${window.location.pathname}`,
    page_path: window.location.pathname,
  });
}

function applyUserContext(user: AnalyticsUser) {
  if (!analytics || !analyticsSdk) return;
  // Use only the internal ID and coarse account properties. Never send email,
  // name, portfolio data, ticker symbols, form input, or AI request contents.
  analyticsSdk.setUserId(analytics, user.id);
  analyticsSdk.setUserProperties(analytics, {
    account_state: "signed_in",
    plan: normalizeProperty(user.plan),
    ...(user.locale ? { locale: normalizeProperty(user.locale) } : {}),
  });
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

function recordMetric(name: string, rawDurationMs: number) {
  const durationMs = Math.max(0, Math.round(rawDurationMs));
  emitEvent("performance_metric", {
    metric_name: normalizeName(name),
    duration_ms: durationMs,
    duration_bucket: durationBucket(durationMs),
  });
}

function recordRequest(area: string, method: string, outcome: string, status: number, rawDurationMs: number) {
  if (!started) return;
  const durationMs = Math.max(0, Math.round(rawDurationMs));
  emitEvent("api_request", {
    area,
    method: method.toLowerCase(),
    outcome,
    status: status || 0,
    duration_ms: durationMs,
    duration_bucket: durationBucket(durationMs),
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
    return { path: "unknown", area: "unknown" };
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
  return normalizeName(`${method}_other`);
}

function normalizePage(path: string) {
  const clean = path.split("?")[0].replace(/\/+$/, "") || "/";
  return clean === "/" ? "home" : clean.slice(1).replace(/\//g, "_");
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "unknown";
}

function normalizeEventName(value: string) {
  const normalized = normalizeName(value).slice(0, 40);
  return /^[a-z]/.test(normalized) ? normalized : `event_${normalized}`.slice(0, 40);
}

function normalizeProperty(value: string) {
  return normalizeName(value).slice(0, 36);
}

function durationBucket(durationMs: number) {
  if (durationMs < 1_000) return "under_1s";
  if (durationMs < 3_000) return "1_to_3s";
  if (durationMs < 10_000) return "3_to_10s";
  if (durationMs < 30_000) return "10_to_30s";
  return "over_30s";
}

function emitEvent(name: string, parameters?: EventParameters) {
  if (!started || !analytics || !analyticsSdk) return;
  try {
    analyticsSdk.logEvent(analytics, normalizeEventName(name), parameters);
  } catch {
    // Analytics must never break the product experience.
  }
}

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
