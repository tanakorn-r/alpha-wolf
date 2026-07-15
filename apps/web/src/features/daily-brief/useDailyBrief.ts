import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  loadAuthUser,
  loadLatestAiResult,
  loadPortfolio,
  loadStockDetailsBatch,
  loadTodayPerformance,
  type DcaOrder,
  type CanonicalDecisionState,
  type PortfolioHolding,
  type StockDetailResponse,
  type StockNewsItem,
  type TodayPerformanceResponse,
} from "../../lib/api";
import { useWolfStore } from "../../store/useWolfStore";
import { formatCurrency, formatMoneyBaht, priceToUsdBase, setFxRates } from "../../lib/format";
import { formatLocalDate } from "../../lib/locale";

export type BriefStatus = "needs_you" | "watch" | "hold";
export type BriefFilter = "all" | BriefStatus;
export type BriefTone = "good" | "warn" | "bad" | "neutral";

export type HoldingEvent = {
  symbol: string;
  kind: "EX-DIV" | "PAYS";
  date: string;
  days: number;
  amount?: number | null;
  perShareUsd?: number | null;
  totalUsd?: number | null;
};

export type DecisionPanel = {
  label: string;
  title: string;
  body: string;
  tone: BriefTone;
  meta?: string;
};

export type HoldingBriefRow = {
  symbol: string;
  name: string;
  strategy: string;
  status: BriefStatus;
  priority: number;
  rating: number;
  actionLabel: string;
  actionTone: BriefTone;
  detailLoading: boolean;
  price: number;
  currency?: string | null;
  todayPct: number;
  history: Array<{ date: string; close: number }>;
  shares: number;
  value: number;
  gainLoss: number;
  gainLossPct: number;
  yieldPct?: number | null;
  headline: string;
  whatToDo: string;
  nextMove: DecisionPanel;
  watchFor: DecisionPanel;
  news: DecisionPanel;
  sellTrigger: DecisionPanel;
  events: HoldingEvent[];
  dcaOrders: DcaOrder[];
  decisionState?: CanonicalDecisionState | null;
};

export type DailyBrief = ReturnType<typeof useDailyBrief>;

export type RowAnalysisState = { loading: boolean; restoring?: boolean; data: TodayPerformanceResponse | null; error: string };

export function useDailyBrief() {
  const activeAgentId = useWolfStore((state) => state.activeAgentId);
  const getHuntAiCache = useWolfStore((state) => state.getHuntAiCache);
  const setHuntAiCache = useWolfStore((state) => state.setHuntAiCache);
  const [filter, setFilter] = useState<BriefFilter>("all");
  const [rowAnalysis, setRowAnalysis] = useState<Record<string, RowAnalysisState>>({});
  const [enrichmentReady, setEnrichmentReady] = useState(false);
  const auth = useQuery({ queryKey: ["auth-user"], queryFn: loadAuthUser, staleTime: 300_000, retry: 0 });
  const accountScope = auth.data?.id ? `user:${auth.data.id}` : "signed-out";
  const portfolio = useQuery({ queryKey: ["portfolio", accountScope], queryFn: loadPortfolio, enabled: Boolean(auth.data?.id) });
  setFxRates(portfolio.data?.fxRates);

  const holdings = portfolio.data?.holdings ?? [];
  const detailRequestKey = holdings.map((holding) => `${holding.symbol}:${holding.strategy}`).sort().join("|");
  useEffect(() => {
    setEnrichmentReady(false);
    if (!detailRequestKey) return;
    // Let the portfolio rows and durable DB reads paint first. Yahoo-backed detail is optional
    // enrichment and must not compete with the content required to enter Daily Brief.
    const timer = window.setTimeout(() => setEnrichmentReady(true), 250);
    return () => window.clearTimeout(timer);
  }, [detailRequestKey]);
  const details = useQuery({
    queryKey: ["stock-details-batch", detailRequestKey, "daily-brief"],
    queryFn: () => loadStockDetailsBatch(holdings.map((holding) => ({ symbol: holding.symbol, strategy: holding.strategy }))),
    staleTime: 180_000,
    enabled: enrichmentReady && holdings.length > 0,
  });

  useEffect(() => setRowAnalysis({}), [activeAgentId, accountScope]);

  const model = useMemo(() => {
    const holdingSymbols = new Set(holdings.map((holding) => holding.symbol));
    const dcaOrders = (portfolio.data?.dcaOrders ?? []).filter((order) => order.status !== "applied" && holdingSymbols.has(order.symbol));
    // Portfolio already contains the holding-only ex-dividend/payment events. Calling the full
    // market calendar here rebuilt unrelated market events and could fan out to Yahoo twice.
    const events = (portfolio.data?.incomeEvents ?? []).filter((event) => holdingSymbols.has(event.symbol) && daysUntil(event.date) >= 0);
    const eventsBySymbol = groupPortfolioEvents(events, holdings, portfolio.data?.fxRates);
    const ordersBySymbol = groupOrders(dcaOrders);

    const rows = holdings
      .map((holding) => buildHoldingRow({
        holding,
        detail: details.data?.[holding.symbol],
        detailLoading: Boolean(holdings.length) && (!enrichmentReady || details.isLoading || details.isFetching),
        events: eventsBySymbol.get(holding.symbol) ?? [],
        dcaOrders: ordersBySymbol.get(holding.symbol) ?? [],
      }))
      .sort((a, b) => b.priority - a.priority || b.rating - a.rating || Math.abs(b.value) - Math.abs(a.value));

    const counts = {
      all: rows.length,
      needs_you: rows.filter((row) => row.status === "needs_you").length,
      watch: rows.filter((row) => row.status === "watch").length,
      hold: rows.filter((row) => row.status === "hold").length,
    };
    const visibleRows = filter === "all" ? rows : rows.filter((row) => row.status === filter);

    return {
      rows,
      visibleRows,
      counts,
      stats: portfolio.data?.summary,
      detailsLoading: details.isLoading,
      detailsFetching: details.isFetching,
      dataTrust: portfolio.data?.dataTrust,
      totalPl: holdings.reduce((sum, holding) => sum + holding.gainLoss, 0),
      summary: buildSummary(rows, counts),
    };
  }, [details.data, details.isFetching, details.isLoading, enrichmentReady, filter, holdings, portfolio.data?.dcaOrders, portfolio.data?.fxRates, portfolio.data?.incomeEvents, portfolio.data?.summary]);

  const persistedRowAnalysis = Object.fromEntries(model.rows.flatMap((row) => {
    const cached = getHuntAiCache<TodayPerformanceResponse>(dailyBriefCacheKey(accountScope, row.symbol, row.strategy, activeAgentId));
    return cached?.data.agent?.id === activeAgentId ? [[row.symbol, { loading: false, restoring: false, data: cached.data, error: "" } satisfies RowAnalysisState]] : [];
  }));
  const displayedRowAnalysis = { ...persistedRowAnalysis, ...rowAnalysis };
  const savedHydrationKey = model.rows.map((row) => `${row.symbol}:${row.strategy}`).join("|");

  useEffect(() => {
    if (!auth.data?.id || !savedHydrationKey) return;
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    setRowAnalysis((current) => {
      const next = { ...current };
      for (const row of model.rows) {
        if (!next[row.symbol]?.data) next[row.symbol] = { loading: false, restoring: true, data: null, error: "" };
      }
      return next;
    });
    void Promise.all(model.rows.map(async (row) => ({
      row,
      data: await loadLatestAiResult<TodayPerformanceResponse>({
        feature: "today",
        subject: row.symbol,
        agent: activeAgentId,
        variantPrefix: `v23:${row.strategy}:`,
        signal: controller.signal,
      }).catch(() => null),
    }))).then((saved) => {
      if (cancelled) return;
      const restored = saved.filter((item) => item.data?.agent?.id === activeAgentId);
      for (const item of restored) {
        setHuntAiCache(dailyBriefCacheKey(accountScope, item.row.symbol, item.row.strategy, activeAgentId), {
          analyzedAt: item.data?.generatedAt ?? new Date().toISOString(),
          data: item.data,
        });
      }
      setRowAnalysis((current) => {
        const next = { ...current };
        for (const item of saved) {
          if (!next[item.row.symbol]?.data) next[item.row.symbol] = { loading: false, restoring: false, data: item.data?.agent?.id === activeAgentId ? item.data : null, error: "" };
        }
        return next;
      });
    }).finally(() => {
      window.clearTimeout(timeout);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [accountScope, activeAgentId, auth.data?.id, savedHydrationKey]);

  return {
    loading: auth.isPending || (Boolean(auth.data?.id) && portfolio.isPending),
    failed: portfolio.isError,
    filter,
    setFilter,
    activeAgentId,
    rowAnalysis: displayedRowAnalysis,
    async analyzeRow(row: HoldingBriefRow, force = false) {
      setRowAnalysis((current) => ({ ...current, [row.symbol]: { loading: true, restoring: false, data: displayedRowAnalysis[row.symbol]?.data ?? null, error: "" } }));
      try {
        // A deliberate Analyze/Refresh remains a forced rerun. Persistence only restores the
        // previous result when the user returns; it never turns Refresh into a stale cache read.
        const data = await loadTodayPerformance(row.symbol, row.strategy, activeAgentId, force);
        setHuntAiCache(dailyBriefCacheKey(accountScope, row.symbol, row.strategy, activeAgentId), { analyzedAt: data.generatedAt ?? new Date().toISOString(), data });
        setRowAnalysis((current) => ({ ...current, [row.symbol]: { loading: false, restoring: false, data, error: "" } }));
      } catch (error) {
        setRowAnalysis((current) => ({ ...current, [row.symbol]: { loading: false, restoring: false, data: current[row.symbol]?.data ?? null, error: error instanceof Error ? error.message : "AI analysis is unavailable." } }));
      }
    },
    retry() {
      void portfolio.refetch();
      void details.refetch();
    },
    ...model,
  };
}

function dailyBriefCacheKey(accountScope: string, symbol: string, strategy: string, agentId: string) {
  return `${accountScope}:persona-v24-agent-evidence-consistency:daily-brief:${symbol}:${strategy}:${agentId}`;
}

function buildHoldingRow({
  holding,
  detail,
  detailLoading,
  events,
  dcaOrders,
}: {
  holding: PortfolioHolding;
  detail?: StockDetailResponse;
  detailLoading: boolean;
  events: HoldingEvent[];
  dcaOrders: DcaOrder[];
}): HoldingBriefRow {
  const price = detail?.stock.price ?? holding.price;
  const currency = detail?.stock.currency ?? holding.currency;
  const todayPct = detail?.stock.changePct ?? holding.changePct ?? 0;
  const rating = clamp(Math.round(detail?.verdict?.score ?? fallbackRating(holding, detail)), 1, 99);
  const rawAction = detail?.verdict?.action ?? "WATCH";
  const action = detail?.decisionState?.timing === "CHASE" && (rawAction === "BUY" || rawAction === "BUY SETUP") ? "WAIT" : rawAction;
  const sma50 = detail?.technicals?.sma50;
  const exDiv = events.find((event) => event.kind === "EX-DIV");
  const payment = events.find((event) => event.kind === "PAYS");
  const belowSellTrigger = typeof sma50 === "number" && sma50 > 0 && price < sma50;
  const openOrder = dcaOrders[0];

  let status: BriefStatus = "hold";
  if ((exDiv && exDiv.days <= 7) || belowSellTrigger || openOrder) {
    status = "needs_you";
  } else if ((exDiv && exDiv.days <= 14) || action === "WATCH" || action === "WAIT" || action === "BUY SETUP" || payment) {
    status = "watch";
  }

  const actionLabel = status === "needs_you" ? actionLabelFor(action, belowSellTrigger, openOrder) : status === "watch" ? "Watch" : "Just hold";
  const actionTone = belowSellTrigger ? "bad" : status === "needs_you" ? "good" : status === "watch" ? "warn" : "neutral";
  const priority = statusPriority(status) + eventPriority(exDiv, payment) + (belowSellTrigger ? 40 : 0) + rating / 100;
  const headline = detail?.verdict?.headline || fallbackHeadline(holding, action, status, exDiv, sma50, price);
  const whatToDo = detail?.verdict?.analyst || headline;

  return {
    symbol: holding.symbol,
    name: detail?.stock.name ?? holding.name,
    strategy: holding.strategy || "Holding",
    status,
    priority,
    rating,
    actionLabel,
    actionTone,
    detailLoading,
    price,
    currency,
    todayPct,
    history: detail?.history?.map((point) => ({ date: point.date, close: point.close })) ?? [],
    shares: holding.shares,
    value: holding.value,
    gainLoss: holding.gainLoss,
    gainLossPct: holding.gainLossPct,
    yieldPct: detail?.business?.dividendYield ?? holding.dividendYield,
    headline,
    whatToDo,
    nextMove: buildNextMove(detail, price, currency),
    watchFor: buildWatchFor(exDiv, payment),
    news: buildNews(detail?.news?.[0], action),
    sellTrigger: buildSellTrigger(sma50, price, currency),
    events,
    dcaOrders,
    decisionState: detail?.decisionState,
  };
}

function buildNextMove(detail: StockDetailResponse | undefined, price: number, currency?: string | null): DecisionPanel {
  const target = detail?.business?.targetMeanPrice;
  if (typeof target !== "number" || !Number.isFinite(target) || !price) {
    return { label: "Next move", title: "Target not available", body: "No analyst target in the detail feed, so treat this as hold/watch until price gives a cleaner setup.", tone: "neutral" };
  }
  const upside = ((target - price) / price) * 100;
  const tone: BriefTone = upside >= 12 ? "good" : upside >= 3 ? "warn" : "bad";
  return {
    label: "Next move",
    title: `${formatSigned(upside)} target upside`,
    body: `Mean target is ${formatNative(target, currency)} versus spot ${formatNative(price, currency)}.`,
    tone,
    meta: "target upside",
  };
}

function buildWatchFor(exDiv?: HoldingEvent, payment?: HoldingEvent): DecisionPanel {
  if (exDiv) {
    const income = exDiv.totalUsd != null ? ` Estimated income from current shares is ${money(exDiv.totalUsd)}.` : "";
    return {
      label: "Watch for",
      title: `Ex-div ${relativeDate(exDiv.days)}`,
      body: `Own before ${shortDate(exDiv.date)} to receive the dividend.${income}`,
      tone: exDiv.days <= 7 ? "bad" : "warn",
      meta: exDiv.days <= 7 ? "deadline" : "calendar",
    };
  }
  if (payment) {
    return {
      label: "Watch for",
      title: `Pays ${relativeDate(payment.days)}`,
      body: payment.totalUsd != null ? `Expected payout is about ${money(payment.totalUsd)} from current shares.` : `Payment date is ${shortDate(payment.date)}.`,
      tone: "good",
      meta: "income",
    };
  }
  return { label: "Watch for", title: "No dividend deadline", body: "No near-term ex-dividend or payment event is visible for this holding.", tone: "neutral" };
}

function buildNews(news: StockNewsItem | undefined, action: StockDetailResponse["verdict"] extends infer V ? V extends { action?: infer A } ? A : never : never): DecisionPanel {
  const tone: BriefTone = action === "BUY" || action === "BUY SETUP" ? "good" : action === "PASS" || action === "WAIT" ? "warn" : "neutral";
  if (!news) return { label: "News", title: "No fresh headline", body: "No news item returned with the stock detail response.", tone };
  return {
    label: "News",
    title: news.publisher || news.provider || sentimentLabel(tone),
    body: news.title,
    tone,
    meta: sentimentLabel(tone),
  };
}

function buildSellTrigger(sma50: number | undefined, price: number, currency?: string | null): DecisionPanel {
  if (typeof sma50 !== "number" || !Number.isFinite(sma50) || !price) {
    return { label: "Sell trigger", title: "Needs chart check", body: "50-day moving average is unavailable, so use the detail chart before reducing.", tone: "neutral" };
  }
  const distance = ((sma50 - price) / price) * 100;
  const below = price < sma50;
  return {
    label: "Sell trigger",
    title: `${formatNative(sma50, currency)} 50-day MA`,
    body: below ? `Price is already ${formatSigned(distance)} versus the 50-day. Review risk now.` : `Exit/risk review if price breaks below the 50-day. Trigger is ${formatSigned(distance)} from spot.`,
    tone: below ? "bad" : distance > -3 ? "warn" : "neutral",
    meta: "break below 50-day MA",
  };
}

function groupPortfolioEvents(
  events: Array<{ date: string; symbol: string; kind: string; amount?: number | null }>,
  holdings: PortfolioHolding[],
  rates?: Record<string, number>,
) {
  const sharesBySymbol = new Map(holdings.map((holding) => [holding.symbol, holding.shares]));
  const grouped = new Map<string, HoldingEvent[]>();
  events
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .forEach((event) => {
      const shares = sharesBySymbol.get(event.symbol) ?? 0;
      // Portfolio income-event amounts are position totals, unlike market-calendar amounts,
      // which are per-share. Keep that contract explicit so we never multiply the payout twice.
      const totalUsd = event.amount != null ? priceToUsdBase(event.amount, event.symbol, rates) : null;
      const perShareUsd = totalUsd != null && shares > 0 ? totalUsd / shares : null;
      const row: HoldingEvent = {
        symbol: event.symbol,
        kind: event.kind === "payment" ? "PAYS" : "EX-DIV",
        date: event.date,
        days: daysUntil(event.date),
        amount: event.amount,
        perShareUsd,
        totalUsd,
      };
      grouped.set(event.symbol, [...(grouped.get(event.symbol) ?? []), row]);
    });
  return grouped;
}

function groupOrders(orders: DcaOrder[]) {
  const grouped = new Map<string, DcaOrder[]>();
  orders
    .slice()
    .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())
    .forEach((order) => grouped.set(order.symbol, [...(grouped.get(order.symbol) ?? []), order]));
  return grouped;
}

function buildSummary(rows: HoldingBriefRow[], counts: Record<BriefFilter, number>) {
  if (!rows.length) return "Add holdings to turn Daily Brief into a portfolio action desk.";
  const lead = rows[0];
  return `${counts.needs_you} need a decision, ${counts.watch} are watch-only, and ${counts.hold} can sit. Start with ${lead.symbol}: ${lead.whatToDo}`;
}

function fallbackRating(holding: PortfolioHolding, detail?: StockDetailResponse) {
  const trend = detail?.performance?.momentumScore ?? 50;
  const valuation = detail?.business?.targetMeanPrice && holding.price ? ((detail.business.targetMeanPrice - holding.price) / holding.price) * 100 : 0;
  return 35 + clamp(trend / 2, 0, 35) + clamp(valuation, -15, 25) + clamp(holding.dividendYield ?? 0, 0, 8);
}

function fallbackHeadline(holding: PortfolioHolding, action: string, status: BriefStatus, exDiv: HoldingEvent | undefined, sma50: number | undefined, price: number) {
  if (sma50 && price < sma50) return `${holding.symbol} is below its 50-day trigger.`;
  if (exDiv && exDiv.days <= 7) return `${holding.symbol} has an ex-dividend decision ${relativeDate(exDiv.days)}.`;
  if (action === "BUY") return `${holding.symbol} has a buy read, but adding still requires the rare-add valuation and funding gates.`;
  if (status === "watch") return `${holding.symbol} needs monitoring, not automatic cash.`;
  return `${holding.symbol} can be held unless the thesis changes.`;
}

function actionLabelFor(action: string, belowSellTrigger: boolean, openOrder?: DcaOrder) {
  if (belowSellTrigger) return "Review risk";
  if (openOrder) return "Apply plan";
  if (action === "BUY" || action === "BUY SETUP") return "Review setup";
  return "Decide";
}

function statusPriority(status: BriefStatus) {
  if (status === "needs_you") return 100;
  if (status === "watch") return 50;
  return 10;
}

function eventPriority(exDiv?: HoldingEvent, payment?: HoldingEvent) {
  if (exDiv) return Math.max(0, 24 - exDiv.days * 2);
  if (payment) return Math.max(0, 12 - payment.days);
  return 0;
}

function daysUntil(value: string) {
  const date = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

function relativeDate(days: number) {
  if (days <= 0) return "today";
  return `in ${days}d`;
}

function shortDate(value: string) {
  return formatLocalDate(new Date(`${value}T00:00:00`), { month: "short", day: "numeric" });
}

function money(usd: number) {
  return formatMoneyBaht(usd);
}

function formatNative(value: number, currency?: string | null) {
  return formatCurrency(value, currency);
}

function formatSigned(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function sentimentLabel(tone: BriefTone) {
  if (tone === "good") return "bullish";
  if (tone === "warn") return "mixed";
  if (tone === "bad") return "bearish";
  return "neutral";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
