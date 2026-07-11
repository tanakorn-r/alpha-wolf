# CLAUDE.md

> **Read this entire file before doing anything else in this repo.** It is the
> single source of truth for how this project is structured, how to write code
> for it, and what state the work is currently in. Do not re-derive this
> context by re-scanning the whole tree every session — that's what this file
> is for. Only fall back to scanning/reading source when this file is silent
> on something or looks contradicted by what you observe.

## How to use this file (read first, update last)

0. **Mandatory, every session, no exceptions**: read this file (`CLAUDE.md`,
   the project's `.claudemd`-equivalent) in full at the very start of the
   session, before reading other source files or writing any code. This is
   not optional context — it is the required first step of every session.
1. **On session start**: read `### STANDARDS` and `### STATE & MEMORY` in
   full before writing any code. They are short by design — that's the token
   budget this file protects. Then use `docs/CODEMAP.md` to locate files:
   it maps every directory, the page→hook→components pattern, and the shared
   UI atoms, so do NOT re-scan the tree with find/glob/grep to orient
   yourself. Keep `docs/CODEMAP.md` updated whenever files are added, moved,
   or deleted.
2. **Before acting**: trust `STANDARDS` for how to write code in this repo.
   Trust `STATE & MEMORY` for what already exists and what's in flight — but
   if a claim here (a file path, a feature, a "done" status) looks wrong when
   you actually touch that area, the code wins; fix this file in the same
   turn.
3. **After every successful create, modify, or delete of a file** (a fix, a
   feature, a refactor, a commit — not just at the end of a session): update
   `### STATE & MEMORY` immediately, in place, **before** considering that
   task complete. This update is mandatory and autonomous — do it
   automatically, without asking the user for permission first. Specifically:
   - Update the relevant bullet in **Current Features** if you touched a
     feature's behavior.
   - Rewrite **Last Change** to describe *only* the most recent change (it is
     a single slot, not a log — overwrite it, don't append).
   - Rewrite **Next Steps** to reflect what's actually still open. Remove
     items you just finished; add items you discovered.
   - Keep entries to one line each. If a bullet needs a paragraph, the detail
     belongs in a commit message or code comment, not here.
4. **Never let this file grow.** It should stay roughly this length forever.
   This is a deliberate token-efficiency device: a few hundred tokens read at
   the start of every session is far cheaper than re-discovering the repo
   from scratch or carrying forward a full conversation history. If a section
   creeps past ~30 lines, prune it — delete resolved items rather than
   archiving them (git history is the archive).
5. **Don't duplicate what git already tells you.** No changelogs, no
   "session N did X" logs, no dates-as-history. `STATE & MEMORY` is a
   snapshot of *now*, not a diary.

---

### STANDARDS

**Monorepo layout** (npm workspaces, no Nx project graph beyond `web`):
- `apps/web/` — React 19 + Vite + TypeScript frontend. The only real client.
- `apps/api/` — FastAPI + SQLite backend (Python). The live, primary backend.
- `apps/go-api/` — Gin-based Go proof-of-concept for a Thailand-stocks feed
  (FinFeed API). Experimental, not wired into the web app yet. Treat as a
  separate, early-stage service — don't assume parity with `apps/api/`.

**Frontend (`apps/web/src/`)**
- State: Zustand, one store (`store/useWolfStore.ts`), reducer-style — state
  and the actions that mutate it live together in a single `create()` call.
- Data fetching: TanStack Query (`useQuery`/`useInfiniteQuery`) for anything
  server-derived; Zustand only for client-side/derived/UI state.
- Routing: `react-router-dom` v6, route table in `App.tsx`.
- Components: `components/` = generic/reusable (e.g. `Money.tsx`,
  `Sparkline.tsx`, `LoadingSpinner.tsx`), `components/layout/` = app shell
  (header/sidebar), `features/<name>/` = feature-scoped components (e.g.
  `features/stock-detail/`), `pages/` = one file per route, composes the
  above + stores.
- Money/currency: money is stored in **USD base** everywhere, but the app
  DISPLAYS **THB as the primary, bold figure**; USD is the small muted
  secondary "≈$X". Use the shared `<Money>` component (`components/Money.tsx`)
  and `formatMoneyDual` (`lib/format.ts`) for prominent money; `formatMoneyBaht`
  for single-value app money (DCA/cash/chart). Any user money *input* is entered
  in THB and divided by `THB_PER_USD` before hitting the USD-base store. Never
  reintroduce a currency *toggle*. Instrument-native prices (stock quote/target,
  per-share dividends) use `formatCurrency(value, currency)` and stay in the
  stock's own trading currency — do NOT convert those.
- Charts: Recharts. `PortfolioPerformanceChart` accepts a `children` prop for
  injecting `ReferenceLine`/`ReferenceDot` markers (e.g. "first buy" dots).
- Styling: Tailwind v4, utility classes inline; dark theme (`#0c0c0e`-ish
  background, `#3ecf8e` accent green, `#f2575c` loss red).

**Backend (`apps/api/`)**
- FastAPI app (`main.py`) + SQLite (`internal/store/`), live market data via
  `yfinance` (`internal/yahoo/`), AI summaries via OpenAI
  (`internal/ai/openai_client.py`, gated by `OPENAI_API_KEY` env var).
- One route file per resource in `routes/`, registered centrally in
  `routes/router.py`. Handlers call into `internal/market/*` for business
  logic and `internal/store/*` for persistence — don't put SQL or business
  logic directly in route handlers.
- `internal/store/portfolio.py` owns two architecturally distinct tables:
  `dca_orders` (planned/intent only) and `holdings` (real owned
  shares/cost-basis). Never conflate them — "planning a buy" must not by
  itself change portfolio totals; only an explicit "apply"/"buy" action
  writes to `holdings`.
- `upsert_holding`'s `ON CONFLICT` does not update `created_at` — that column
  is the reliable "first purchase date" anchor for chart start-dates.
- Portfolio chart series (`internal/market/portfolio.py`) must clip each
  holding's price history to on/after its own purchase date — never plot
  price history a position wasn't actually exposed to. Same-day purchases
  with no historical bar yet fall back to a single synthetic point using the
  live quote.
- yfinance data is delayed (~15-20 min); there is no true real-time feed
  without a paid provider. State this plainly if asked — don't overclaim
  freshness.

**Cross-cutting conventions**
- No premature abstraction: prefer 2-3 duplicated lines over a generic
  wrapper used once. A bug fix doesn't need surrounding cleanup.
- Comments only for non-obvious WHY (hidden constraints, workarounds,
  driver/library quirks) — never restate WHAT the code does.
- Guard defensive checks once at the data boundary (e.g. an API client
  normalizing a bad response), not scattered as `?.`/`|| []` everywhere.
- Never commit secrets. `OPENAI_API_KEY`, `FINFEED_API_KEY`, etc. are env-var
  only, even when pasted into chat — tell the user to rotate it if they paste
  a real key.
- Git commits: heredoc-style `git commit -m "$(cat <<'EOF' ... EOF)"` with a
  `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` trailer. Only
  commit when explicitly asked.

---

### STATE & MEMORY

**Current Features**
- Architecture: every page is a thin composition (<60 lines) — all state lives
  in a feature hook (`features/<name>/use<Name>.ts`) created at page level and
  passed to presentational components as one grouped object (`<Tab hunt={hunt} />`,
  components read `hunt.strategy.mode` etc.). Shared UI atoms in
  `components/ui/` (panels, Badge/TagPill, PillTabs, icons, Modal).
- Dashboard (`pages/DashboardPage.tsx` + `features/dashboard/*`): portfolio
  stats, holdings table, performance chart, direct **Add-to-portfolio** modal
  (`HoldingFormModal` + `useDashboard.holdingForm`: ticker + units + price →
  `holdings`, averages into an existing position), sell modal. No DCA/budget flow.
- DCA Scanner (`pages/StockHuntPage.tsx` + `features/stock-hunt/*`, `/scanner`):
  search/market/sector/sort filters, "In my plan" chip, AI top-5 rank + buy.
- Income Calendar (`pages/DividendHuntPage.tsx` + `features/dividend-hunt/*`,
  `/calendar`): ex-date/payment-date month grid + side list.
- Hunt AI (`pages/HuntAiPage.tsx` + `features/hunt-ai/*`, `/hunt-ai`; `/deep-ai`
  and `/day-trader` redirect here; `/daily-brief` also redirects to
  `/hunt-ai?tab=brief`): shared watchlist (holdings + `deepExtras`) + tabs —
  **Daily Signals** (V6 recommendation cards: reasons, target entry, AI score),
  **Daily Brief** (`DailyBriefTab.tsx` → `features/daily-brief/*`: portfolio
  action queue grouped needs-you/watch/hold, real per-row **Analyze** via
  `summarizeStock` → `AiVerdictCard`, real portfolio-wide **Ask the desk** via
  `loadPortfolioReview` → shared `components/PortfolioReviewCard.tsx` — no
  hardcoded per-agent text, every "AI" read is a genuine agent-backed call),
  **Buy Timing** (selected-stock timing page backed by `/buy-timing`: plain answer row, 12-month **buy/trim-by-month** map (`monthlyMap`: blended seasonality + dividend-cycle score per calendar month, green=buy/red=trim), real dividend-cycle dips, recovery, edge, seasonality + optional AI narrative),
  **Live Intraday** (delayed ~15-20min quote/chart + on-demand AI signal),
  **Next 10 ↑** (quota-metered `upward-moves` forecast, cached per
  ticker/timeframe, only 1D/1W real), **Strategy** (5 mode cards + optional
  brief → playbook), **Analyst** (search any ticker → score card + price chart + 6-panel
  grid). Daily Brief/Strategy/Analyst/N100 paywalled behind local-only `premium` flag.
  All tab state lives in `features/hunt-ai/useHuntAi.ts` (grouped return:
  `watchlist/signals/timing/intraday/next100/strategy/analyst`); pure helpers in
  `features/hunt-ai/lib.ts`.
- Stock detail drawer has a "✦ Deep AI" button → `DeepAnalysisPanel.tsx`.
- Mobile: `apps/web` is wrapped with Capacitor v8 (native projects `apps/web/ios`+`apps/web/android`, config `apps/web/capacitor.config.ts`, appId `com.alphawolf.app`, webDir `dist`). Scripts `cap:sync`/`cap:ios`/`cap:android`/`cap:add:*`. Native build needs `apps/web/.env.production` with absolute `VITE_API_BASE` (no dev proxy on device). Full workflow in `apps/web/MOBILE.md`.
- `apps/go-api`: Gin FinFeed POC, not on live path. Kept for reference.

**Last Change**
- Restored an explicit per-row **Analyze/Refresh** button on Daily Brief (`PremiumAiButton`, xs, sublabel "Today"), matching the same convention as `SignalsTab`/`AnalystTab` elsewhere in Hunt AI — reversing the earlier "whole row is the tap target" design per feedback. `BriefQueueRow`'s outer element is back to a plain `<article>` (was a `<button>`, which can't nest the AI button); the AI button drives `runAnalysis()` (opens panel + always refetches, so "Refresh" genuinely reruns), and the open panel keeps its own small "Close" control plus the `TodayPanel`'s own "Re-run". Verified live: click → `POST /today?agent=vera` fires, button flips to "REFRESH · Today", AI score updates, panel opens with a Close control, matching the rest of the app's AI-button pattern exactly. Follow-up fix: the `TodayPanel`'s own internal "Re-run" button visually overlapped the row-level "Close" button (both absolute/inline near the same top-right corner) — removed the now-redundant internal Re-run (the outer Refresh button already reruns it); `TodayPanel` no longer takes an `onRerun` prop. tsc clean.
- Made the `/today` (session-read) AI call genuinely agent-differentiated, not just differently-voiced. Root cause: `agentInputPack` (Kai's volumeCheck, Ben's forwardView, Vera's valuation, Sam's income, etc. — built earlier this session) was present in every call's context, but no task instructions ever told the model to route through it; the existing per-agent aspect system (`ANALYST_PERSPECTIVES`/`_analyst_perspective_directive` in `agents.py`) only fires when `analyst_task=True`, and is explicitly a 3-5-year outlook mandate — wrong horizon for a same-day call, would have undone the prior "no target price" fix. Fix: added a same-day-scoped directive directly to `_today_performance_instructions()` in `openai_client.py` telling the model to build `sessionRead`/`keyLevel`/`action` strictly from the selected Agent's `agentInputPack.inputPriority`/`mustAnswer`, present-tense only. Verified live: same SIRI.BK session, Kai vs. Sam — Kai (buyScore 34) reads it entirely through volume/crowd confirmation ("crowd showed up sleepy — fakeout risk is loud," gates action on "1.5x average volume"); Sam (buyScore 68) reads the same session as income/DCA noise ("keep sizing normal... do not chase this flat close"), never mentions volume. Different scores, different focus, same data. py compile clean.
- Swapped Daily Brief's per-row AI call from `summarizeStock` (the Analyst-tab endpoint — 12-month target price, suggested entry, long-horizon thesis) to the already-built-but-unused `loadTodayPerformance` (`POST /analysis/{symbol}/today`, backend prompt explicitly "today's move only... do not invent... future prices"). Daily Brief is a same-day triage tool, not a valuation tool — showing a 12-month forecast there was the wrong horizon entirely. Built a new small `TodayPanel` in `DailyBriefView.tsx` (replaces `AiVerdictCard`, which is now Analyst-tab/drawer only) rendering the `TodayPerformanceResponse` shape: signal, headline, summary, session read, what-changed-today, key level, action, risk, `buyScore` as the AI score. `useDailyBrief.ts`'s `analyzeRow`/`RowAnalysisState` retyped to `TodayPerformanceResponse`. Verified live: tapping SIRI.BK now calls `POST /api/analysis/SIRI.BK/today?agent=vera` and shows a genuinely present-tense read ("Today did not change the larger setup...", key level "1.48 resistance; first real buy zone is 1.39") with **no target price anywhere**. tsc clean.
- Simplified Daily Brief's UX per feedback: removed the portfolio-wide "Ask the desk" hero button and hook wiring (`askDesk`/`portfolioReview`/`loadPortfolioReview` all deleted from `useDailyBrief.ts` — unused) and the per-row "Analyze"/"Refresh" button. Each holding row is now itself the tap target (`BriefQueueRow` is a `<button>`; tapping opens the panel and fires `analyzeRow` once, cached after — no refetch on reopen). Replaced the always-visible "platform score" (rule-based `detail.verdict.score`, confirmed NOT AI — pure RSI/MACD/SMA/volume math in `build_verdict`) with a genuine **AI score**: shows "—" until tapped, then `state.data.confidence` from the real per-agent call, color-coded by tone. Reframed the whole page around three plain triage words instead of generic status labels: **Chill** (hold)/**Watch**/**Sell** — `TRIAGE_COPY` + a `triageTag()` helper that only shows "Sell" when a row's `actionTone` is genuinely bad (risk trigger), falling back to the specific action (e.g. "Buy more") for the same bucket's non-sell cases, so the label stays honest. Verified live: tapping SIRI.BK fires the real `POST /api/analysis/SIRI.BK?agent=vera`, shows loading progress, then a real "74 AI SCORE" (vs. the old fake "68 platform score") plus the full genuine Vera Sterm verdict panel. tsc clean.
- Rebuilt Daily Brief so every "AI" line is a real agent call instead of hardcoded per-agent prose. Root cause: `guruBriefThought`/`agentRowInsight`/`dailyBriefAnalystRead`/`buildBriefAnalysis` in the old `DailyBriefView.tsx` were hand-written TS if/else strings keyed on `agent.id` — the "Analyze" button rendered a real-looking `AiVerdictCard` from 100% client-fabricated data, no API call. Fix: `useDailyBrief.ts` gained `askDesk()` (calls `loadPortfolioReview`, same endpoint Dashboard's AiAdvisor uses) and `analyzeRow(row)` (calls `summarizeStock`, same endpoint the Analyst tab/drawer use), each with real loading/error state. `DailyBriefView.tsx` rewritten to render genuine results via `AiVerdictCard`/new shared `components/PortfolioReviewCard.tsx` (extracted from `AiAdvisor.tsx` so Dashboard and Daily Brief render identical real output), and to reuse `PillTabs`/`TagPill` instead of bespoke buttons — removed all fake narrative functions. Also discovered `/daily-brief` no longer routes to `pages/DailyBriefPage.tsx` (deleted, fully orphaned) — it now redirects to `/hunt-ai?tab=brief`, a paywalled `DailyBriefTab.tsx` that already wired to these same `features/daily-brief/*` files. Verified live (via `aw_premium` localStorage unlock): both `POST /api/analysis/{symbol}?agent=` and `POST /api/analysis/portfolio/review?agent=` fire for real and render genuine agent-specific prose (Vera: "I would personally not buy this at 1.47 today; I would buy only below about 1.39"). tsc clean on all touched files.
- Fixed a second currency bug (root cause of "buy THB, turns to dollar, calcs back to THB"): `holding.price` from the backend is instrument-**native** (e.g. THB for `.BK`), but `SellModal` fed it straight into `<Money>` (which assumes USD-base and multiplies by 36.5 for THB display) — a real ฿19,845 payout showed as ฿724,342 with the correct number mislabeled `≈$19,845`. Fixed `SellModal.tsx`: "Current price" now uses `formatCurrency(price, currency)` (native, unconverted, per the money convention), "Estimated proceeds" now computes `shares * priceToUsdBase(price, currency)` before `<Money>`. Also fixed `HoldingsTable`'s sparkline, which compared `averageCost` (USD-base) against `holding.price` (native) — always drew a fake spike for THB holdings regardless of real gain/loss; now both sides go through `priceToUsdBase`. Verified live: SIRI.BK sell modal now shows "THB 1.47" current price and "฿19,845 ≈$544" proceeds (matches Total value exactly).
- Fixed the first currency bug: the new direct-add flows stored a THB per-share price raw into `averageCost`, but the portfolio store is USD base (backend `_to_base` divides live THB prices by 36.5) — so THB cost basis read ~36.5× inflated. Added `priceToUsdBase(price, currencyOrSymbol)` in `lib/format.ts` (`.BK`/THB → ÷36.5, else as-is) and applied it in all three add paths: `useDashboard.holdingForm.submit`, `StockDetailDrawer` add-mutation (uses `stock.currency`), and `useStockHunt.applyTop5` (native price → correct share count for a USD budget). Verified: PTT.BK @ ฿35 → stored averageCost 0.9589 USD (=35/36.5), cost $9.59 → displays ฿350. US unaffected.
- Made the Stock Hunt **sector filter work** (yfinance `yf.screen` never returns a `sector` field, so the catalog was all "Unknown"). Fix: `catalog._refresh_region` now screens **per sector** over `CATALOG_SECTORS` (11 GICS values) and tags each record via `_record_from_quote(..., sector_hint)`; `_catalog_fresh` auto-invalidates old all-"Unknown" caches so they rebuild once. Filtering is **server-side**: `build_market_page(sector=)` + `/api/discover?sector=` + `loadDiscoveries({sector})`; `useStockHunt` sends `sector`, keys the query on it, drops the client-side filter, and the dropdown uses a fixed `SECTORS` list. Also removed "Cash to invest" from `HuntFilters`/`useStockHunt` (Top-5 uses flat $200/pick). Verified: Energy → 53 US+Thai matches (PTT/OR.BK/BP…). US catalog now 385 recs (35/sector). Note: cold catalog refresh now does ~22 screens (cached 24h). (Prior: `StatsRow` day-change/positions/Annual income; `StockRecord.quoteType?`.)

**Next Steps**
- (open) Mobile: the portfolio glance is sidebar-only (dropped on mobile bottom-nav) — surface it somewhere reachable, then a real device/simulator run of the iOS+Android builds.
- (open) Optional: if DCA stays unused, delete the dormant `dca_orders` table/routes + cash-reserve store + Daily Brief DCA grouping in a later cleanup pass.
- (open) Do a visual QA pass against AlphaWolfV6 screenshots once seeded holdings exist.
- (open) Optional: `/api/details/{symbol}/upward-moves` return real currency
  so Next 10 shows ฿ for THB tickers (only matters for non-USD holdings).
- (open) Optional: surface the Kaohoon SET feed as a standalone market-news
  panel (e.g. top of Daily Brief), not just merged per-.BK-ticker.
- (open) Commit when user is ready.
