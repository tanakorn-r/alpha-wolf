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
   budget this file protects.
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
- Money/currency: USD is always the primary, bold figure; THB is always a
  small muted secondary "≈฿X" next to it. Use the shared `<Money>` component
  (`components/Money.tsx`) and `formatMoneyDual` (`lib/format.ts`) for every
  prominent money value — never reintroduce a currency *toggle*.
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
- Dashboard (`pages/DashboardPage.tsx`): portfolio stats, holdings table,
  performance chart, DCA plan card (add funds, apply plan → real `holdings`
  writes), sell modal. 5-screen nav: Dashboard, Scanner, Deep AI, Day
  Trader, Calendar (matches the `~/Downloads/AlphaWolf*/` mockups).
- Strategy Scanner (`pages/DiscoverPage.tsx`): top5 picks per strategy,
  "Buy all 5 now" executes real purchases.
- Deep AI Analysis (`pages/DeepAiPage.tsx`, `/deep-ai`): a shared watchlist
  (holdings + user-added `deepExtras`, persisted in `useWolfStore`) feeds two
  tabs — **Daily Signals** (per-symbol swing cards via go-api
  `loadDeepAnalysis`, reusing `DeepChart`/`OrderCard`/`DecideForMeCard` from
  `components/DeepAnalysisPanel.tsx`) and **Next 100 ↑** (gated behind a
  local-only `premium` flag/paywall modal, no real billing). Watchlist chips
  double as the Next 100 ticker selector (glow green when active on that
  tab, matching the mockup) — no separate ticker row. A manual "Predict"
  button burns one unit of a persisted `n100QuotaUsed`/`N100_QUOTA_LIMIT`
  quota (shown as a `used/100` bar) and fetches up to 100 *real* historical
  upward moves via `GET /api/details/{symbol}/upward-moves`
  (`internal/market/patterns.py`) — each move's "confidence" is a real
  percentile rank within that stock's own historical up-move distribution,
  not a fabricated prediction. Only 1D/1W timeframes are real (yfinance
  daily bars); intraday timeframe buttons are shown disabled.
- Day Trader AI (`pages/DayTraderPage.tsx`, `/day-trader`): watchlist
  (default SPY/TSLA/NVDA/AAPL + custom add/remove) with real quotes
  (`loadStockDetail`) and a "Get AI verdict" button wired to the real
  `summarizeStock` endpoint — no fake/simulated data anywhere on this page.
- Income Calendar (`pages/IncomeCalendarPage.tsx`): ex-date/payment-date view
  backed by `internal/market/calendar.py`.
- Stock detail drawer has a "✦ Deep AI" button opening the slide-over Deep
  Analysis panel (`components/DeepAnalysisPanel.tsx`) for one symbol.
- `apps/go-api`: Gin service for FinFeed-backed Deep Analysis swing levels.
  Requires a real `FINFEED_API_KEY` in `apps/go-api/.env`.

**Last Change**
- Ported the AlphaWolfV2 mockup's Deep AI Analysis additions
  (`~/Downloads/AlphaWolfV2/Cadence.dc.html` — plain `text/x-dc` source,
  diff it against `AlphaWolf Cadence.html`'s decoded bundle to find what's
  new): shared watchlist with add/remove, a Daily Signals/Next 100 tab
  split, and a local-only premium paywall. The mockup's "Next 100" was a
  seeded-PRNG fake-prediction generator; per user direction, replaced it
  with `internal/market/patterns.py` computing real historical upward-move
  percentile stats instead — deliberately not 1:1 with the mockup here,
  because shipping fabricated "AI predictions" against real money decisions
  would be dishonest even though the mockup itself labeled it "simulated".
  None of this session's changes are committed yet.

**Next Steps**
- FinFeed's domain (`finfeedapi.com`) returns a Cloudflare bot-challenge
  (403) to every automated client tested — Deep AI Analysis page/panel
  can't be verified against live data from this sandbox. Need the user to
  confirm the real API base URL/auth/paths from their FinFeed dashboard.
- Note: port 8080 is sometimes occupied locally by an unrelated process —
  if `npm run dev:go-api` fails to bind, check for a stray process first.
