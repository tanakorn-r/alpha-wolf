# Alpha Wolf Engineering Guide

This document is the durable coding and architecture contract for Alpha Wolf.
Use it when adding features, reviewing changes, or deciding where code belongs.

For repository navigation, see [`docs/CODEMAP.md`](docs/CODEMAP.md). For the
current product state and active work, see [`claude.md`](claude.md). When this
guide and the running code disagree, verify the behavior, update the code or
this guide, and keep the contract explicit.

## 1. Engineering principles

1. **Protect correctness before convenience.** Financial values, account data,
   AI output, and portfolio state must never be guessed or silently fabricated.
2. **Keep boundaries visible.** Routes transport data, domain modules make
   decisions, stores persist data, and providers talk to external services.
3. **Prefer the smallest complete change.** Do not combine a focused fix with
   unrelated cleanup or a speculative framework.
4. **Model state once.** Server state, durable client state, and transient UI
   state have different owners; do not mirror them without a clear reason.
5. **Design failure states deliberately.** Loading, empty, stale, pending,
   unauthorized, and error are product states, not afterthoughts.
6. **Measure before optimizing.** Preserve the existing cache, batching, lazy
   loading, and bounded-concurrency contracts; add complexity only for an
   observed bottleneck.
7. **Explain why, not what.** Names and structure should explain normal code.
   Comments document constraints, tradeoffs, and non-obvious provider behavior.

## 2. Repository architecture

```text
apps/web (React client)
    -> HTTP contract in apps/web/src/lib/api.ts
        -> apps/api/routes (FastAPI transport)
            -> apps/api/internal/market | internal/ai (domain logic)
                -> apps/api/internal/store (SQLite/Turso persistence)
                -> apps/api/internal/yahoo | internal/news (providers)

apps/go-api (experimental Gin/FinFeed service; not on the production web path)
```

### Applications

| Path | Role | Status |
| --- | --- | --- |
| `apps/web/` | React 19, Vite, TypeScript, Tailwind, Capacitor | Production client |
| `apps/api/` | FastAPI, SQLite/Turso, yfinance, OpenAI | Production API |
| `apps/go-api/` | Gin, SQLite, FinFeed proof of concept | Experimental and independent |

Do not assume feature parity between the Python and Go APIs. A production web
feature targets `apps/api` unless the task explicitly changes that decision.

### Dependency direction

- UI components may depend on feature hooks, shared UI, and client API types.
- Feature hooks may depend on TanStack Query, Zustand selectors, pure helpers,
  and `lib/api.ts`.
- Client API code must not import React or feature components.
- FastAPI routes may depend on domain and store modules.
- Domain modules may depend on providers and stores, but not on FastAPI route
  modules.
- Store modules own SQL and database transaction details.
- Provider modules own third-party response normalization.
- Lower layers must not import higher layers to avoid circular architecture.

## 3. Frontend architecture (`apps/web`)

### Feature structure

Product routes follow this flow:

```text
pages/FooPage.tsx
    -> features/foo/useFoo.ts
    -> features/foo/FooPanel.tsx
    -> components/ui/* and components/*
```

- **Pages are thin compositions.** They create the feature hook once and wire
  grouped results into presentational components. Keep product pages near the
  established `<60` line target. Marketing and legal pages may be longer when
  their job is primarily static presentation.
- **Feature hooks own feature behavior.** Queries, mutations, event handlers,
  derived view models, and coordinated state belong in `use<Name>.ts`.
- **Feature components render.** Prefer one grouped prop such as
  `{ hunt: StockHunt }`; do not scatter the same state across many props.
- **Pure logic belongs in `lib.ts` or a named model file.** It should be usable
  without rendering React.
- **Reusable components belong in `components/`.** Only move something to
  `components/ui/` after it represents a real shared visual primitive.
- **The route table lives in `src/App.tsx`.** Route-level features should be
  lazy-loaded unless they are necessary for the first public render.

### State ownership

Choose the narrowest correct owner:

| State kind | Owner |
| --- | --- |
| Server-derived data, cache, request status | TanStack Query |
| Cross-route client/UI state that must persist | `useWolfStore.ts` |
| State local to one feature workflow | Feature hook |
| Purely visual state local to one component | Component `useState` |
| URL-addressable navigation/filter state | Router path or search params |

Rules:

- Never copy a query result into Zustand merely to make it globally available.
- Keep Zustand actions beside the state they mutate and select only the slice a
  component needs.
- Query keys must include every input that changes the result: account scope,
  symbol, agent, strategy, filters, and version where applicable.
- Mutations must invalidate or update the exact affected query keys.
- Derived arrays and objects used during rendering should be computed, not
  synchronized through effects.
- Effects are for synchronization with an external system, not ordinary data
  transformation.

### API boundary

- All frontend HTTP calls and response types live in `src/lib/api.ts` unless a
  future split creates equally explicit resource modules.
- Use `trackedFetch` so operational telemetry remains consistent.
- Authenticated requests use `credentials: "include"`.
- Check `response.ok` and throw a user-meaningful error. Handle expected status
  codes such as `202`, `401`, and `404` intentionally.
- Normalize uncertain external data at the backend/provider boundary. The UI
  should not contain repeated fallback chains for the same malformed field.
- Keep TypeScript response types aligned with Pydantic models and actual JSON
  casing. A contract change requires updating both sides in the same change.
- Do not expose provider payloads directly to components; return an app-owned
  shape.

### TypeScript and React style

- TypeScript runs in strict mode. Do not use `any` to bypass a model problem;
  use `unknown`, validate it, then narrow it.
- Prefer `type` for unions and object shapes. Use discriminated unions for
  workflows with distinct states.
- Use `import type` for type-only imports.
- Components and exported types use `PascalCase`; hooks use `useCamelCase`;
  functions and variables use `camelCase`; module constants use `UPPER_SNAKE_CASE`.
- Keep functions focused. Extract a helper when it names domain logic or removes
  meaningful repetition, not merely to reduce line count.
- Do not mutate query results, props, or Zustand state objects in place.
- Use early returns for loading, error, empty, or unauthorized branches when it
  makes the main render path clearer.
- Avoid non-null assertions. If a value is guaranteed, make the guarantee
  visible through validation or control flow.
- Event handlers that intentionally ignore a promise should use `void`.
- Never perform paid AI calls or expensive market-data work automatically on
  component mount. They require explicit user action unless the endpoint is a
  documented cached bootstrap/read path.

### UI, styling, and accessibility

- Use Tailwind v4 utilities and the existing Alpha Wolf tokens in `styles.css`.
- Reuse `Surface`, `Modal`, `Badge`, `PillTabs`, panel states, agent components,
  `Money`, and shared icons before adding a new primitive.
- Preserve the radius hierarchy: chip `8px`, control `10px`, card `16px`, frame
  `22px` through the `--aw-radius-*` tokens.
- Preserve semantic color meaning: green is positive, red is loss/risk, amber
  is caution, and agent colors identify the active persona. Never rely on color
  alone to communicate a state.
- Use `<Money>` for portfolio totals and locale-aware helpers for numbers and
  dates. Instrument prices remain in their native trading currency.
- Interactive controls need an accessible name, keyboard behavior, visible
  focus, and a real `button`, `a`, or form element whenever possible.
- Modals must trap/restore focus, close predictably, and prevent background
  scrolling using the existing shared utilities.
- Every async panel must expose an intentional loading, empty, error, and retry
  experience as applicable.
- Avoid raw SVG duplication when an icon already exists in `components/ui/icons.tsx`.

### Frontend performance

- Keep route-level code splitting intact and avoid importing large dashboard or
  chart modules into the public landing bundle.
- Use TanStack Query caching before creating a second cache.
- Debounce user-driven search and cancel obsolete requests.
- Bound polling, retries, pagination, and concurrency. Every loop needs a clear
  stop condition.
- Avoid duplicate requests while a drawer/modal owns the same data path.
- Prefer compact endpoint payloads for list rows; fetch full detail only when the
  user opens the detail experience.

## 4. Python API architecture (`apps/api`)

### Layer responsibilities

| Layer | Responsibility | Must not contain |
| --- | --- | --- |
| `main.py` | App setup, middleware, startup, global errors | Feature logic |
| `routes/` | HTTP parsing, auth checks, status codes, response models | SQL or complex domain logic |
| `internal/market/` | Market calculations and deterministic business rules | FastAPI request/response coupling |
| `internal/ai/` | Prompting, AI access, quality gates, AI orchestration | Account/session persistence details |
| `internal/store/` | SQL, transactions, durable caches, account scoping | HTTP behavior |
| `internal/yahoo/`, `internal/news/` | Provider access and normalization | UI-specific shapes |
| `models.py` | Stable Pydantic API contracts | Provider-specific objects |

Register each new router in `routes/router.py`. Route handlers should be small:
validate and normalize input, authorize, call a domain function, translate the
result into an HTTP response.

### Python style

- Use `from __future__ import annotations` in Python modules.
- Add type annotations to public functions and non-obvious local structures.
- Use `snake_case` for functions and variables, `PascalCase` for classes, and
  `UPPER_SNAKE_CASE` for constants.
- Prefer small pure helpers for normalization and calculations.
- Catch exceptions only when the layer can recover, add context, translate to a
  stable error, or preserve an intentional fallback. Never silently swallow an
  unknown failure.
- Use `HTTPException` at the route boundary. Domain and store modules should
  raise domain/standard exceptions rather than depend on HTTP semantics.
- Preserve error IDs and server-side logging for unexpected exceptions; do not
  return stack traces or provider secrets to clients.
- Validate collection size and concurrency before scheduling work.

### Persistence and transactions

- Use `internal/store/db.py::connect()` for both local SQLite and production
  Turso/libSQL. Never create an ad hoc database connection path.
- Scope account-owned reads and writes by `user_id` on every query.
- Parameterize SQL; never interpolate user input into SQL strings.
- Keep a logical write operation in one transaction and commit deliberately.
- Do not replay a write after an ambiguous connection failure.
- Schema changes belong in the idempotent migration path and must work for both
  SQLite and libSQL.
- Preserve the bounded process-lifetime libSQL pool. Do not introduce a global
  database lock or per-query remote connection creation.
- Cache keys must include all inputs that affect correctness and must not leak
  data between accounts.

### External market data

- New request paths must not synchronously wait on yfinance. Serve durable or
  cached data, mark it stale/pending when necessary, and refresh in bounded
  background work.
- Keep stale-while-revalidate, singleflight, refresh cooldown, and TTL behavior
  centralized in the provider/cache layers.
- Normalize missing, null, NaN, timezone, symbol, and currency values once at
  ingestion.
- Keep provider attribution and freshness metadata. Yahoo data is delayed and
  must never be presented as exchange-real-time.
- A provider failure returns a truthful stale, pending, unavailable, or partial
  state. It must not produce invented market values.

### AI behavior

- AI execution requires the established account/access gate and quota claim.
- Reuse persisted evidence and cached AI results according to their versioned
  contracts. `force=true` regenerates reasoning; it does not imply bypassing
  durable market-data caches.
- Attach run context, model/prompt version, source timestamps, data trust, and
  decision state to persisted results.
- AI output must pass the production quality gate before publication.
- Release quota on failed publication and preserve the last valid result when
  the existing contract permits it.
- Never label deterministic placeholder prose as AI-generated analysis.
- Financial recommendations must expose uncertainty and the evidence controlling
  the decision; they are product guidance, not guaranteed outcomes.

### Authentication and security

- Authentication is enforced server-side. Client gating is presentation only.
- Preserve secure, HttpOnly session cookies, nonce validation, legal acceptance,
  and account lifecycle behavior.
- Secrets and credentials are environment variables only. Never commit `.env`
  files, tokens, API keys, cookie values, or production database URLs.
- Avoid logging credentials, complete provider payloads, or unnecessary personal
  data.
- Validate redirect and return paths before using them.
- Changes touching auth, billing, account deletion/export, entitlements, or AI
  credits require targeted regression tests.

## 5. Go API (`apps/go-api`)

The Go service is an isolated proof of concept. Follow idiomatic Go without
forcing Python API architecture into it:

- `internal/http` owns Gin transport and route registration.
- `internal/analysis` and `internal/market` own domain behavior.
- `internal/store` owns persistence.
- `internal/finfeed` owns the provider contract.
- `internal/config` owns environment parsing and defaults.
- Pass dependencies explicitly; do not add mutable package globals.
- Return and wrap errors with context at layer boundaries.
- Run `gofmt` on changed Go files and add tests beside the package.
- Update `docs/openapi.yaml` when the public Go contract changes.

Do not wire the web app to this service or duplicate a Python feature in Go
unless the task explicitly calls for migration or parity.

## 6. Financial domain invariants

These are correctness rules, not presentation preferences:

- Portfolio money is stored in USD base. Display totals use the authenticated
  account's selected base currency.
- Stock quotes, targets, and per-share dividends remain in the instrument's
  native currency.
- Convert at explicit boundaries; never compare or aggregate values from
  different currencies without conversion.
- `dca_orders` represent plans or intent. `holdings` represent owned shares and
  cost basis. Planning a purchase must not change portfolio totals.
- A holding's `created_at` is its first-purchase anchor and must survive an
  upsert.
- Portfolio performance begins on or after each holding's purchase date. Do not
  chart exposure before ownership.
- Use a truthful synthetic same-day point only when the established chart
  contract requires it and historical data is not yet available.
- No mock prices, fabricated analyst targets, or fake AI conclusions. Render an
  empty, pending, stale, or unavailable state instead.

## 7. Testing and validation

Test the smallest affected surface first, then the integration boundary. Add a
regression test for every bug whose behavior can be expressed deterministically.

### Standard commands

```bash
# Frontend type check and production build
npx tsc -p apps/web/tsconfig.json --noEmit
npm run build:web

# Public SEO contract
npm run test:seo
node apps/web/scripts/test-seo.mjs --dist

# Python API
python3 -m unittest discover -s apps/api/tests -p 'test_*.py'
npm run build:api

# Go API (run from apps/go-api)
go test ./...
go build ./...

# Whole production build
npm run build

# Dependency security audit
npm run security:scan
```

Not every change needs every command. Use this minimum matrix:

| Change | Required validation |
| --- | --- |
| React/component/style | Type check, web build, relevant browser viewport |
| Feature hook/query/API client | Type check, web build, success/error/pending path |
| SEO/public static file | SEO source test, web build, SEO dist test |
| Python domain/store/route | Targeted unit tests, full API test discovery when practical, API build |
| Database/auth/billing/AI credits | Targeted regression tests plus full API suite |
| Go code | `gofmt`, `go test ./...`, `go build ./...` |
| Shared API contract | Backend test plus frontend type check/build |

Tests must be deterministic. Mock provider/network boundaries, not the domain
logic under test. Use temporary databases for persistence tests and verify
account isolation where relevant.

## 8. Change workflow

1. Read this guide, `claude.md`, and the relevant section of `docs/CODEMAP.md`.
2. Inspect the smallest set of files that owns the behavior.
3. State the invariant or user outcome before editing.
4. Make the smallest coherent change at the correct layer.
5. Add or update a regression test when behavior changes.
6. Run proportional validation from the matrix above.
7. Review the diff for secrets, unrelated edits, debug output, and contract drift.
8. Update `docs/CODEMAP.md` when paths are added, moved, or removed.
9. Update the current-state memory in `claude.md` as required by that file.
10. Commit only when explicitly requested; do not overwrite unrelated work in a
   dirty worktree.

## 9. Review checklist

Before considering a change complete, confirm:

- The code lives in the correct layer and dependencies point downward.
- Financial values preserve units, currency, freshness, and ownership meaning.
- Account data and caches are correctly scoped.
- Loading, empty, stale/pending, error, and unauthorized states are intentional.
- External calls are cached, bounded, cancellable, or explicitly user-triggered
  as appropriate.
- Types and API models agree across the frontend/backend boundary.
- UI changes reuse shared components and remain keyboard/mobile accessible.
- No secret, credential, personal data, fabricated value, or misleading
  real-time/AI claim was introduced.
- The relevant tests and builds pass.
- Documentation reflects structural or invariant changes.

## 10. Patterns to avoid

- SQL, provider calls, or complex calculations inside route handlers.
- `fetch` calls inside presentational components.
- Copying TanStack Query data into Zustand.
- Business state spread across many component-local hooks.
- A generic abstraction with only one real caller and no clear domain name.
- Scattered null fallbacks compensating for an unnormalized API boundary.
- Unbounded thread pools, retries, polling, or background refreshes.
- Synchronous yfinance calls in a new request path.
- Treating a plan as an executed holding or mixing native and base currency.
- AI calls on mount, fake AI copy, or publishing an unvalidated AI response.
- New one-off colors, radii, panels, icons, loaders, or modal behavior.
- Drive-by formatting or refactoring unrelated to the requested change.
- Comments that narrate obvious code, dead commented-out code, or debug logs.

