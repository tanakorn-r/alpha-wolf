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
- Daily Brief (`pages/DailyBriefPage.tsx` + `features/daily-brief/*`, `/daily-brief`): portfolio movers, open DCA amount, and holding dividend deadlines in one morning brief.
- Dashboard (`pages/DashboardPage.tsx` + `features/dashboard/*`): portfolio
  stats, holdings table, performance chart, DCA plan card (apply plan → real
  `holdings` writes), sell modal.
- DCA Scanner (`pages/StockHuntPage.tsx` + `features/stock-hunt/*`, `/scanner`):
  search/market/sector/sort filters, "In my plan" chip, AI top-5 rank + buy.
- Income Calendar (`pages/DividendHuntPage.tsx` + `features/dividend-hunt/*`,
  `/calendar`): ex-date/payment-date month grid + side list.
- Hunt AI (`pages/HuntAiPage.tsx` + `features/hunt-ai/*`, `/hunt-ai`; `/deep-ai`
  and `/day-trader` redirect here): shared watchlist (holdings + `deepExtras`)
  + 6 tabs — **Daily Signals** (V6 recommendation cards: reasons, target entry, AI score),
  **Buy Timing** (selected-stock timing page backed by `/buy-timing`: plain answer row, month map, real dividend-cycle dips, recovery, edge, seasonality + optional AI narrative),
  **Live Intraday** (delayed ~15-20min quote/chart + on-demand AI signal),
  **Next 10 ↑** (quota-metered `upward-moves` forecast, cached per
  ticker/timeframe, only 1D/1W real), **Strategy** (5 mode cards + optional
  brief → playbook), **Analyst** (search any ticker → score card + price chart + 6-panel
  grid). Strategy/Analyst/N100 paywalled behind local-only `premium` flag.
  All tab state lives in `features/hunt-ai/useHuntAi.ts` (grouped return:
  `watchlist/signals/timing/intraday/next100/strategy/analyst`); pure helpers in
  `features/hunt-ai/lib.ts`.
- Stock detail drawer has a "✦ Deep AI" button → `DeepAnalysisPanel.tsx`.
- `apps/go-api`: Gin FinFeed POC, not on live path. Kept for reference.

**Last Change**
- Buy Timing now ships an AI recap: `BuyTimingNarrative` gained `recap` (plain-words buy-now-or-wait-how-long), `agentFit` (aligned/neutral/against — does buying at the current price fit the active agent persona's strategy) and `agentFitReason` (first-person, persona voice); instructions in `_buy_timing_instructions`, passthrough in `apply_ai_narrative`, types in `api.ts`, rendered as the fit-colored `AgentRecap` panel in `BuyTimingTab.tsx` (only when the OpenAI narrative ran — calculated fallback shows no recap). Verified end-to-end on SIRI.BK.

**Next Steps**
- (open) Do a visual QA pass against AlphaWolfV6 screenshots once seeded holdings exist.
- (open) Optional: `/api/details/{symbol}/upward-moves` return real currency
  so Next 10 shows ฿ for THB tickers (only matters for non-USD holdings).
- (open) Optional: surface the Kaohoon SET feed as a standalone market-news
  panel (e.g. top of Daily Brief), not just merged per-.BK-ticker.
- (open) Commit when user is ready.
