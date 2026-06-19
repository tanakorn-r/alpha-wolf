# CLAUDE.md

## Project overview
Internal tool combining git-like admin management with a ChatGPT-style dashboard. The Head Engineer (admin) issues AI-usage tokens to developers; developers call an AI proxy with their token; admin tracks/audits usage per developer. Monorepo with two halves:
- api-server/ — Go backend (SQLite, JWT admin auth, opaque developer tokens)
- admin-dashboard/ — React + Vite admin UI (the only client; developers integrate directly against the API, no UI of their own)

## Backend structure (`api-server/`)
main.go                        entrypoint: wires DB, AI client, router; reads all env config
internal/
  store/                       persistence layer — every DB read/write lives here, nowhere else
    store.go                   DB.Open(), migration runner (go:embed + sorted filename order)
    migrations/000N_*.sql      one file per schema change, applied in order, every boot
    developer.go, token.go,    one file per table/aggregate; method receiver is always `*DB`
    usage.go, dashboard.go,
    admin.go, seed.go
  http/                        HTTP layer — one file per resource, mirrors store/ naming
    router.go                  all routes registered here; `protected` sub-mux wrapped in RequireAuth
    chat.go, tokens.go,        Handler functions: `XHandler(db *store.DB, ...) http.HandlerFunc`
    developers.go, usage.go,
    quota.go, login.go
    middleware.go              CORS + RequireAuth (JWT) — auth is NOT per-handler, it's mux-level
  auth/                        bcrypt (admin passwords), JWT (admin sessions), opaque tokens (devs)
  ai/                          AI provider clients — mock.go (no-op) + openai.go (real), same interface shape
Conventions:
- Go 1.22+ net/http method-pattern routing (`mux.HandleFunc("GET /path/{id}", ...)`) — no router framework.
- Every handler: parse path/body → look up entity (404 if missing) → business logic → writeError or JSON-encode. Never `panic`, never swallow errors.
- Migrations are idempotent: ALTER TABLE ADD COLUMN errors with "duplicate column name" are tolerated in `store.go`'s migrate() since every boot re-runs every migration file against the same persisted `dev.db`.
- SQLite via modernc.org/sqlite stores time.Time in Go's native String() format — `date()`/`MAX()` SQL functions silently break on that column. Do date bucketing and "latest row" lookups in Go (`ORDER BY id DESC LIMIT 1`), not SQL.
- DB file path is anchored via runtime.Caller(0) in `main.go`, not cwd-relative — go run . must be invoked from inside `api-server/`.

## Frontend structure (`admin-dashboard/src/`)
App.tsx                        BrowserRouter + route table + RequireAuth wrapper
main.tsx                       React root, imports index.css
stores/                        Zustand — see "State management" below
  authStore.ts, dashboardStore.ts, developerStore.ts, tokenStore.ts, usageStore.ts
lib/apiClient.ts                fetch wrapper: attaches bearer token, 401 → logout, .get/.post/.getArray
hooks/useEscapeKey.ts          shared behavior hooks (not components)
components/
  ui/                           dumb, generic, no business logic: Button, Input, StatCard, ErrorText
  layout/                       AppLayout (shell), Sidebar (nav), Topbar (breadcrumb + admin menu)
  dashboard/                    feature components scoped to dashboard/profile views: TeamTable,
                                 ContributorsHeatmap, StatGauge, QuotaBar, DeveloperProfileCard
  *.tsx (root of components/)   cross-page modals: RevealTokenModal, CreateTokenModal, CommitDetailModal, Form
pages/                          one file per route, composes components + stores, owns page-level state
  Login.tsx, Dashboard.tsx, DevelopersList.tsx, DeveloperDetail.tsx
Component rule of thumb: ui/ knows nothing about the app's domain (just props in, markup out). dashboard/ components know domain shapes (`DeveloperUsageRow`, `DailyActivityPoint`) but not which page renders them. pages/ is the only place that wires a store to a component tree.

## State management ("Redux-style" Zustand)
Every store is a single create<State>((set, get) => ({...})) call — state and the actions that mutate it live together, like a Redux slice with built-in dispatch:
ts
interface FooState {
  items: Foo[];
  loading: boolean;
  fetchItems: () => Promise<void>;   // action
}
export const useFooStore = create<FooState>((set, get) => ({
  items: [],
  loading: false,
  fetchItems: async () => {
    set({ loading: true });
    const items = await apiClient.getArray<Foo>('/admin/foo');
    set({ items, loading: false });
  },
}));
Rules:
- No component-local useState for anything that survives a re-render of a sibling or a route change — it goes in a store.
- Async actions live in the store, not in the component (`pages/*.tsx` calls fetchX() in a `useEffect`, never fetch() directly).
- Cross-entity caches are keyed by id: Record<number, T> or Record<number, T[]> (see `tokensByDeveloperId`, `eventsByDeveloperId`) — never a single flat array that has to be filtered client-side.
- API boundary is guarded once in apiClient.getArray<T>() (coerces non-array → `[]` with `console.warn`), not with `?.`/`|| []` scattered at every render site.

## Styling
Tailwind v4, CSS-first config (`index.css` @theme block — no `tailwind.config.js`). Brand tokens: --color-brand (#5955ed), `--color-brand-light`, `--color-muted`. Rounded-2xl white cards on a bg-brand-light page background is the dominant pattern; status pills are rounded-full px-2 py-1 text-xs font-medium with semantic bg/text color pairs (green=active, red=revoked, gray=idle).

## Working style
- User is a Head Engineer, harsh reviewer, wants fast execution: "think less, just write the code."
- Default to implementing directly; only ask a clarifying question when genuinely ambiguous (e.g. two divergent technical approaches), and batch multiple questions into one AskUserQuestion call rather than asking serially.
- When the user gives critical feedback, don't just comply silently — briefly state the tradeoff, then follow their call once made (they want to be convinced, not just obeyed, but they do make the final decision).

## Code conventions
- No premature abstraction: a bug fix doesn't need surrounding cleanup, a one-shot operation doesn't need a helper. Prefer 2-3 duplicated lines over a generic wrapper used once.
- Guard defensive checks at the API/data boundary once (e.g. apiClient.getArray<T>() normalizes non-array responses with a `console.warn`), not scattered as `?.`/`|| []` at every render site.
- Comments only for non-obvious WHY (hidden constraints, driver quirks, workarounds) — never restate WHAT the code does.
- Go: stdlib net/http method-pattern routing (no router framework), go:embed for SQL migrations, idempotent migrations (tolerate "duplicate column name" since ALTER TABLE ADD COLUMN reruns on every boot).
- SQLite via modernc.org/sqlite stores time.Time in Go's native String() format, breaking `date()`/`MAX()` SQL functions on that column — do date bucketing/latest-row lookups in Go instead of SQL.
- React: Zustand stores (reducer-style), Tailwind v4 CSS-first @theme tokens (no config file), react-router-dom v6.
- Never commit secrets (API keys) — pass via env var at runtime only, even when the user pastes one in chat.

## Gotchas
- go run . must be invoked from within the module directory (api-server/); anchor DB paths with `runtime.Caller(0)`, not cwd-relative, so the database persists regardless of invocation directory.
- Backend takes ~1.5-2s to bind after `go run .`; check /healthz before firing requests in smoke tests.