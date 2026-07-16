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
- Money/currency: money is stored in **USD base** everywhere and portfolio totals
  render in the authenticated account's persisted `settings.baseCurrency`; USD
  remains a muted secondary only when it differs from the selected currency.
  Use the shared `<Money>` component and locale-aware helpers in `lib/format.ts`.
  Instrument-native prices (stock quote/target, per-share dividends) use
  `formatCurrency(value, currency)` and stay in the stock's own trading currency.
- Charts: Recharts. `PortfolioPerformanceChart` accepts a `children` prop for
  injecting `ReferenceLine`/`ReferenceDot` markers (e.g. "first buy" dots).
- Styling: Tailwind v4, utility classes inline; dark theme (`#0c0c0e`-ish
  background, `#3ecf8e` accent green, `#f2575c` loss red).

**Backend (`apps/api/`)**
- FastAPI app (`main.py`) + `internal/store/db.py`: local SQLite file in dev,
  remote Turso/libSQL in production (`TURSO_URL`/`LIBSQL_DATABASE_URL` env var
  present). The Turso path reuses a bounded process-lifetime connection pool
  (`connect()`, default 4) — never create an ad hoc connection path; fresh
  connections per call caused TLS overhead, while one global lock serialized prod.
  Live market data via `yfinance` (`internal/yahoo/`), AI summaries via OpenAI
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
  `components/ui/` (Surface/MetricCard, panels, Badge/TagPill, PillTabs, icons,
  Modal); all Agent results/loading use `AgentCall`/`AgentThinking`.
- Dashboard (`pages/DashboardPage.tsx` + `features/dashboard/*`): compact 980px
  Agent-first layout, four-stat row, short performance/allocation charts, dense
  holdings + income split, direct **Add-to-portfolio** modal
  (`HoldingFormModal` + `useDashboard.holdingForm`: ticker + units + price →
  `holdings`, averages into an existing position), sell modal. No DCA/budget flow.
- DCA Scanner (`pages/StockHuntPage.tsx` + `features/stock-hunt/*`, `/scanner`):
  search/market/sector/sort filters, "In my plan" chip, AI top-5 rank + buy; discovery fetching pauses while Stock Detail is open so it cannot compete with the drawer request.
- Income Calendar (`pages/DividendHuntPage.tsx` + `features/dividend-hunt/*`,
  `/calendar`): ex-date/payment-date month grid + side list.
- Hunt AI (`pages/HuntAiPage.tsx` + `features/hunt-ai/*`, `/hunt-ai`; `/deep-ai`
  and `/day-trader` redirect here; `/daily-brief` also redirects to
  `/hunt-ai?tab=brief`): shared watchlist (holdings + `deepExtras`) + tabs —
  **Daily Signals** (V6 recommendation cards: reasons, target entry, AI score),
  **Daily Brief** (`DailyBriefTab.tsx` → `features/daily-brief/*`: portfolio
  action queue grouped needs-you/watch/hold, compact per-row **Today Plan** via
  a slim price/tape/position/structure context (batch rows return only the fields rendered, with 56 closes and one news item) → one persona-exclusive action,
  horizon alignment, 2-3 controlling facts, and continue/exit gates; real portfolio-wide **Ask the desk** via
  `loadPortfolioReview` → shared `components/PortfolioReviewCard.tsx` — no
  hardcoded per-agent text, every "AI" read is a genuine agent-backed call),
  **Buy Timing** (selected-stock timing page backed by `/buy-timing`: plain answer row, 12-month **buy/trim-by-month** map (`monthlyMap`: blended seasonality + dividend-cycle score per calendar month, green=buy/red=trim), where `buyBudgetPct` applies only to that month's delegated DCA contribution while action/sizing remain the selected Agent's own persona decision; real dividend-cycle dips, recovery, edge, seasonality + optional AI narrative),
  **Live Intraday** (delayed ~15-20min quote/chart + on-demand AI signal),
  **Technical Analysis** (Pro, on-demand Agent read plus a six-month annotated price chart: grounded Dow pivots, Wyckoff heuristic window, Elliott bias, Fibonacci levels, multi-timeframe badges, persona-weighted framework evidence, and structure/dividend context only when aligned),
  **Next 10 ↑** (quota-metered `upward-moves` forecast, cached per
  ticker/timeframe, only 1D/1W real), **Strategy** (5 mode cards + optional
  brief → playbook), **Analyst** (search any ticker → score card + price chart + 6-panel
  grid). Daily Brief/Strategy/Analyst/N100 paywalled behind local-only `premium` flag.
  All tab state lives in `features/hunt-ai/useHuntAi.ts` (grouped return:
  `watchlist/signals/timing/intraday/next100/strategy/analyst`); pure helpers in
  `features/hunt-ai/lib.ts`. Analyst uses one `/analysis/{symbol}/report` endpoint: database-first quote/research reads, `202` polling for cold quotes, 15-minute report reuse, explicit-refresh regeneration, and a one-minute UI deadline.
- Stock detail drawer uses the reference 22/16/10 radius hierarchy in a compact 1040px frame, active-Agent Quick Read, equal six-tab navigation, reusable `DrawerMetric`, and grounded peer/Dow/Wyckoff/Elliott/Fibonacci/multi-timeframe cards via `AdvancedInsightCard`; opening uses only the detail service, cold-cache pending data gets six bounded backoff checks, and AI, portfolio, and research/market tabs remain local-cache or explicit-click work.
- Mobile: `apps/web` is wrapped with Capacitor v8 (native projects `apps/web/ios`+`apps/web/android`, config `apps/web/capacitor.config.ts`, appId `com.alphawolf.app`, webDir `dist`). Scripts `cap:sync`/`cap:ios`/`cap:android`/`cap:add:*`. Native build needs `apps/web/.env.production` with absolute `VITE_API_BASE` (no dev proxy on device). Full workflow in `apps/web/MOBILE.md`.
- `apps/go-api`: Gin FinFeed POC, not on live path. Kept for reference.

**Last Change**
- Added `code.md` as the repository-wide engineering contract for architecture boundaries, coding style, financial/AI invariants, security, testing, and review workflow; linked it from `docs/CODEMAP.md`.

**Recent Context**
- Fixed a live crash (`Uncaught RangeError: Invalid currency code : null` in `StockDetailDrawer`'s `DrawerHeader`, `formatCurrency`). Root cause: `formatCurrency(value, currency = "USD")`'s default parameter only covers `undefined`, not an explicit `null` — and `detail.stock.currency` can genuinely be `null` now that the backend's cache-first fallback (prior entries) returns empty fields immediately for a freshly-uncached symbol instead of blocking until real data arrives. Fixed `formatCurrency` (`apps/web/src/lib/format.ts`) to coalesce `currency || "USD"` so `null` and `undefined` both fall back correctly. Checked the file for the same gap elsewhere: `formatMoneyAs` requires a non-optional `"USD" | "THB"` literal union, so TypeScript already catches a stray `null` there at compile time — `formatCurrency` was the only vulnerable one. tsc clean.
- Added a refresh-attempt cooldown on top of the cache-first/background-refresh system (prior entry): `internal/store/cache.py` gained `should_attempt_refresh(namespace, key, min_interval_seconds)` — tracks last-attempted-at per key regardless of success/failure, separate from the existing singleflight `try_acquire_compute_lock`. That lock alone only stopped *concurrent* duplicate refreshes; it didn't stop *sequential* retries — a symbol that keeps failing/timing out against Yahoo would get re-attempted on every new request that found it stale, seconds apart. `_refresh_in_background` (`internal/yahoo/client.py`, shared by all 5 cache-first functions including `backtrade.py`'s) now checks this first: won't even attempt a new refresh for the same key within `MIN_REFRESH_ATTEMPT_INTERVAL_SECONDS = 60`. `py_compile` clean; not yet redeployed.
- Prior round: converted `load_ticker_modules`/`fetch_history`/`fetch_news`/`fetch_dividends` (`internal/yahoo/client.py`) + `backtrade.py._load_financial_timeline` from blocking-on-cache-miss to always-return-cached+background-refresh (per explicit user direction: no request path may ever touch yfinance synchronously). Verified empty-fallback safety via `.get()`-defensive `merge_ticker_info`. `detail.py`'s `build_detail_bundle` inherits the speedup, no changes needed. **Known gap**: `internal/market/calendar.py._market_events` still blocks on live Yahoo calls (full catalog scan, structurally different) — not yet converted. Also: bumped `MODULES_TTL_SECONDS` 180→900s after live-testing `GET /api/details/AAPL` against prod (`curl`) showed first-hit 7.2s / warm-hit 70-100ms, proving Turso was already fixed and the remaining cost was yfinance cache-miss frequency.
- (older, frontend, resolved) A long refresh-time "blink" investigation ended with the real cause: `apps/web/index.html` had static SEO marketing HTML hardcoded inside `<div id="root">` instead of `<noscript>`, so every real browser painted it before React replaced it, on every route. Fixed by emptying `#root` and moving that content to `<noscript>`. Along the way, also fixed (harmless, kept): `apps/web/public/sw.js`'s backwards navigation caching (was serving stale-forever), a duplicate 17hr-old dev server on port 4200, and removed `React.StrictMode` from `main.tsx` (none of these were the actual cause, but are real fixes worth keeping).
- Reworked Dashboard to the newer compact reference: `/` owns its in-page heading (no duplicate global header), content caps at 980px with 14px rhythm, portfolio Agent Call has a compact density/byline/score/footer, four metrics hold one row from 800px, chart heights drop to 210/144px, holdings rows stay tabular in the narrower lower split, income is denser, and the active Agent now anchors the Dashboard sidebar above portfolio value. tsc/Vite clean.
- Fixed the Stock Detail Analysis tab's fabricated zero-price-target fallback: no real analyst coverage now renders "No analyst price target yet" instead of target=low=high=current with a misleading 0.00% badge.
- Rebuilt `StockDetailDrawer` against the supplied modal reference: 1180px/22px frame, simplified header with outlined portfolio action + SVG close, Agent-accented Quick Read, equal six-tab bar, concise Overview, and a single reusable `DrawerMetric` for return, technical, consensus, calendar, and market values. Fixed a real flex-shrink bug that collapsed the tab bar to 11px tall; live desktop QA now shows the intended 53px bar with no drawer overflow.
- Fixed the Daily Brief row's price `Sparkline` rendering too thick/uneven. Root cause: the SVG uses `viewBox="0 0 100 32"` with `preserveAspectRatio="none"` to stretch non-uniformly and fill whatever width the container ends up (up to 190px) — but the stroke's `strokeWidth="2.5"` wasn't compensated for that distortion, so the rendered line thickness ballooned unevenly depending on local slope and actual width. Added `vector-effect="non-scaling-stroke"` (keeps stroke a true constant screen-pixel width regardless of the viewBox transform) and dropped `strokeWidth` to `1.5` for a crisp, thin line. tsc clean; not exercised live.
- Fixed the Daily Brief row's third grid column being too narrow (`172px`) for the ring/spinner + "AI SCORE" label + Analyze/Refresh button, which squeezed the label until it wrapped to two lines — widened to `200px` and added `whitespace-nowrap` as a hard guarantee.
- Fixed 6 stacked Daily Brief UI bugs from a user screenshot review: (1) `WatchlistBar.tsx` capped "Watching" to 4 chips + a "+N more" expand toggle (was: all 15 wrapped into a wall), relabeled "You hold"/"Watching" → "Holding"/"Watching · N"; (2) `formatMoneyAs` (`lib/format.ts`) now puts a space between the ฿ symbol and the digits — some fonts' ฿ glyph has a wide right sidebearing that visually collided with a following "0"; (3) `DailyBriefView.tsx` dropped the redundant "X chill/Y watch/Z sell" `TagPill` row in the hero card — the `PillTabs` filter row one line below already shows the same counts; (4) the per-row AI score is now a `Ring` (matching `AgentCall`'s established ring-for-confidence convention) instead of a bare number with a "···" loading placeholder; (5) `AgentThinking.tsx` gained an optional `onClose` prop (renders inline in the header row next to the percentage) threaded through `PremiumLoading`, so Daily Brief's per-row Close button now lives inside the "analyzing" card instead of floating `absolute` over it — non-loading (error/data) states get a plain in-flow Close row instead; (6) `HuntTabsBar.tsx` tabs now carry a `premium` flag and only show the PRO/LAB badge when `premium && tab !== active` — Signals incorrectly had a "PRO" badge despite not being gated, and every tab (including whichever you're on) always showed its badge. tsc clean; not exercised live (Hunt AI requires a real login).
- Fixed the Hunt AI page header/watchlist bar to match the design reference. Root cause: `features/hunt-ai/HuntHero.tsx` (an elaborate rainbow-border banner) was dead code — never imported by `pages/HuntAiPage.tsx` — so the page had no title/subtitle at all above the tabs. Deleted the unused `HuntHero.tsx`; added a plain "Hunt AI" title + subtitle directly in `HuntAiPage.tsx` matching the design doc. Also fixed `WatchlistBar.tsx`: chip/input radii were off-token (`rounded-[7px]`/`rounded-lg`/`rounded`) → now `--aw-radius-chip`/`--aw-radius-control`; removed the green dot bullets on every ticker chip and group label (not in the reference, just visual noise). tsc clean; not exercised live (Hunt AI requires a real login).
- Fixed the Dashboard portfolio review's Agent-switch/cache bugs (`features/dashboard/useDashboard.ts`). Root cause: `analysis` was plain unkeyed `useState` — lost on navigation (no persistence), and not re-keyed on `activeAgentId` so switching Agents kept showing the previous Agent's stale review with its own "Re-run" instead of the "Review portfolio" prompt. Fix mirrors the existing Hunt AI cache pattern (`useWolfStore.getHuntAiCache`/`setHuntAiCache`, localStorage-persisted, keyed `${accountScope}:v1:portfolio-review:${activeAgentId}`): the displayed review now derives from local state or the persisted cache, but only if its `agent.id` matches the currently active Agent — otherwise null (prompts a fresh run). `askAi()` still always does an unconditional `force=true` fetch on click (server already honored `force` correctly), so Re-run works whether or not the Agent changed, and now also writes through to the persisted cache. tsc clean; not exercised live (Dashboard requires a real login).
- UI consistency pass (in progress) against a design reference (`Downloads/UI consistency improvements/Alpha Wolf UI System.dc.html`: radius scale chip=8/control=10/card=16/frame=22 as `--aw-radius-*` tokens in `styles.css`, plus canonical `AgentCall`/`AgentCard`/`AgentThinking` components — most of this was already built pre-session). Retired `AiVerdictCard`'s old `accent="tone"` mode (agent color is now the only accent path); built one shared `components/ui/PaywallGate.tsx` and swapped all four bespoke "Unlock Pro" cards (`DailyBriefTab`/`AnalystTab`/`Next100Tab`/`StrategyTab`) onto it; migrated the base `components/ui/Modal.tsx` and `components/ui/Badge.tsx` onto the `--aw-radius-*` tokens. tsc clean. Still open: `AppHeader`/`AppSidebar`/`MobileNav`, `HoldingFormModal`/`SellModal`, `StockDetailDrawer`, `HuntFilters`/`Top5Panel`/`WatchlistBar`/`HuntHero`/`ChartTooltip` not yet audited.
- (older, superseded) Several earlier Daily Brief iterations — making the per-row AI call genuinely agent-backed instead of fabricated client-side prose, swapping the endpoint to a same-day-scoped read, adding/removing an "Ask the desk" hero button — are now folded into the current `DailyBriefView.tsx`/`useDailyBrief.ts`, see above. Two now-resolved currency-base bugs (THB cost basis stored ~36.5× inflated on add; `SellModal`/`HoldingsTable` comparing native vs. USD-base prices) were fixed via `priceToUsdBase` in `lib/format.ts`, applied at all add/sell paths. The Stock Hunt sector filter was fixed server-side (`catalog._refresh_region` now screens per-sector).

**Next Steps**
- (open) The database-only forced-AI path is deployed to Tokyo (`alpha-wolf-api-00005-5wz`) and the currently routed Jakarta compatibility API (`alpha-wolf-api-00029-ms9`). Trigger one authenticated forced SIRI.BK valuation on the new revision and verify its data-preparation timing; switch Cloudflare `VITE_API_BASE` to Tokyo once authenticated.
- (open) UI consistency sweep, going page-by-page per user review: still-unaudited files against the `--aw-radius-*` token scale — `AppHeader`/`AppSidebar`/`MobileNav`, `HoldingFormModal`/`SellModal`, `HuntFilters`/`Top5Panel`/`ChartTooltip`. Stock Detail drawer is now done; Stock Hunt and Dividend Hunt still need review. Needs a real logged-in session to verify gated AI results.
- (open) Mobile: the portfolio glance is sidebar-only (dropped on mobile bottom-nav) — surface it somewhere reachable, then a real device/simulator run of the iOS+Android builds.
- (open) Optional: if DCA stays unused, delete the dormant `dca_orders` table/routes + cash-reserve store + Daily Brief DCA grouping in a later cleanup pass.
- (open) Do a visual QA pass against AlphaWolfV6 screenshots once seeded holdings exist.
- (open) Optional: `/api/details/{symbol}/upward-moves` return real currency
  so Next 10 shows ฿ for THB tickers (only matters for non-USD holdings).
- (open) Optional: surface the Kaohoon SET feed as a standalone market-news
  panel (e.g. top of Daily Brief), not just merged per-.BK-ticker.
- (open) Commit when user is ready.
