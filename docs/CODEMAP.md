# CODEMAP — read this instead of scanning the tree

Token-lean directory + pattern map. If a path here is missing on disk, trust
disk and fix this file. Update the map whenever files are added/moved/deleted.

## Monorepo layout

```
apps/web   React 19 + Vite + Tailwind v4 + TanStack Query + Zustand (port 4201 via nx)
apps/api   FastAPI + yfinance (port 8000), proxied at /api from the web dev server
apps/go-api  Gin POC — NOT on live path, ignore unless asked
```

Dev servers: `.claude/launch.json` (names: `web`, `api`).
Checks: `cd apps/web && npx tsc --noEmit && npx vite build`.

## Frontend pattern (THE practice — follow it, don't invent)

Every page = thin composition (<60 lines), zero raw-HTML logic:

```tsx
export function FooPage() {
  const foo = useFoo();                 // ALL state/queries/handlers live here
  return <section><FooBar foo={foo} /><FooTab foo={foo} /></section>;
}
```

- State hook: `features/<name>/use<Name>.ts` — returns **grouped objects**
  (`hunt.watchlist.symbols`, `hunt.strategy.run(mode)`). Components never call
  useQuery/useState for business state; they receive the one grouped prop.
- Presentational components: `features/<name>/*.tsx`, single prop
  `{ hunt: HuntAi }` style. Private sub-components stay unexported in the same file.
- Pure helpers/constants: `features/<name>/lib.ts`.
- Shared atoms only in `components/ui/` — don't re-create panels/pills/icons.

## apps/web/src — where things live

| Path | What's inside |
|---|---|
| `App.tsx` | Route table. `/` `/daily-brief` `/scanner` `/calendar` `/hunt-ai` (+ redirects `/deep-ai`,`/day-trader`,`/discover`) |
| `pages/` | Thin pages only: Dashboard, DailyBrief, StockHunt(=/scanner), DividendHunt(=/calendar), HuntAi |
| `features/daily-brief/` | `useDailyBrief.ts` + DailyBriefView: portfolio movers, open DCA, and holding dividend deadlines |
| `features/dashboard/` | `useDashboard.ts`, `usePlanCard.ts` + StatsRow, HoldingsTable, PlanCard, SellModal, ChartsRow, AiAdvisor, EmptyPortfolio… |
| `features/stock-hunt/` | `useStockHunt.ts` + HuntFilters, MatchList/MatchCard, RankBanner, Top5Panel |
| `features/dividend-hunt/` | `useDividendHunt.ts`, `calendarModel.ts` + CalendarCard, CalendarSide |
| `features/hunt-ai/` | `useHuntAi.ts` (grouped: watchlist/signals/timing/technical/intraday/next100/strategy/analyst), `lib.ts`, `ui.tsx` (panel const, PremiumLoading…), WatchlistBar, HuntTabsBar, SignalsTab, BuyTimingTab, `TechnicalAnalysisTab` (annotated structure chart + Agent read), BacktradeTab, AnalystTab |
| `features/stock-detail/` | `StockDetailDrawer.tsx` + `DrawerMetric.tsx` + `AdvancedInsightCard.tsx`: compact 1040px research drawer, Agent Quick Read, equal six-tab navigation, reusable metric and advanced-analysis cards |
| `components/ui/` | Shared atoms: `Surface.tsx` (tokenized card/inset/frame shells), `panels.tsx` (LoadingPanel/LoadingStrip/EmptyPanel/RetryPanel/ErrorBanner/ErrorCard), `Badge.tsx` (Badge/SignalChip/TagPill), `PillTabs.tsx`, `icons.tsx` (Spark/Search/ArrowUp), `Modal.tsx` |
| `components/agents/` | Shared agent presentation: `AgentCall` canonical verdict anatomy, `AgentThinking` canonical progress state, plus `AgentCard`, `AgentByline`, and `AgentRecap` |
| `components/settings/` | Authenticated locale gate, three-step first-login wizard, and consolidated region/currency reconfiguration dialog |
| `components/` | Cross-feature: DeepAnalysisPanel, AiVerdictCard, PremiumAiButton, Money, Sparkline, LoadingSpinner, `charts/`, `layout/` (AppLayout/Sidebar/Header) |
| `lib/api.ts` | ALL backend calls + response types (loadPortfolio, loadStockDetail, loadDeepAnalysis, loadUpwardMoves, summarizeStock, loadStrategyPlaybook, loadDiscoveries…) |
| `lib/` | `locale.ts` (detected/persisted locale choices + date helpers), `format.ts` (locale-aware portfolio/native money and numbers), `chart.ts`, `cn.ts`, `symbolColor.ts` |
| `store/useWolfStore.ts` | Zustand + localStorage: holdings UI state, deepExtras watchlist, premium flag, n100 quota + report cache, openDetail drawer |
| `data/market.ts` | StockRecord/StrategyKey types, strategy descriptions |
| `theme.ts`, `styles.css` | Dark Cadence theme; `aw-rainbow-*` classes in styles.css |

## apps/api — where things live

| Path | What's inside |
|---|---|
| `main.py` / `routes/router.py` | App entry / route registration |
| `routes/` | One file per endpoint group: portfolio, settings, auth, details (incl. `/deep`, `/buy-timing`, `/upward-moves`), discover, analysis (AI), calendar, dashboard, market, quote, presets…; `bootstrap.py` consolidates account, Agent, notification, and watchlist shell state into one startup request |
| `models.py` | Pydantic response models (mirror `lib/api.ts` types) |
| `internal/market/` | Business logic: detail.py, deep.py (rule-based deep read), buy_timing.py (dividend-cycle timing), patterns.py (upward-moves), discovery, portfolio, scoring, technicals, universe, calendar; `catalog.py` serves stale data immediately and deduplicates background Yahoo refreshes |
| `internal/ai/` | openai_client.py, heuristics.py, context.py |
| `internal/store/` | SQLite/Turso persistence: portfolio, user locale settings, durable AI response cache, replay jobs, Yahoo/cache tables; `db.py` owns the bounded process-lifetime remote connection pool |
| `internal/yahoo/client.py` | yfinance wrapper (per-ticker quotes, history, news) |
| `internal/news/kaohoon.py` | Kaohoon International SET feed (WordPress REST); `market_news()` cached, merged into `.BK` detail news by `detail.py::merge_thai_market_news` |
| `tests/` | Backend unit/regression tests; `test_libsql_pool.py` covers remote-pool saturation/reuse, `test_catalog_stale_while_revalidate.py` covers non-blocking catalog refresh, and `test_bootstrap.py` covers signed-in/anonymous startup aggregation |

## Conventions that save tokens

- Money: portfolio values remain USD-base internally and render in the signed-in account's selected base currency; `formatCurrency(value, currency)` keeps instrument prices in their native trading currency.
- Colors: green `#3ecf8e`, red `#f2575c`, amber `#f5c451`, blue `#74a4ff`, purple `#c77dff`; panel = `rounded-xl border border-[#2a2a31] bg-[#161619]`.
- No mock data anywhere — empty/error states instead.
- AI endpoints run only on explicit user action (button), never on mount.
- Premium gating is a local `premium` flag in the store; no billing.
