# Cadence Production Implementation

## Product Inventory

### Pages

1. **Strategy Dashboard** (`/`)
   - Portfolio metrics: value, invested cost, gain/loss, dividends YTD.
   - Portfolio performance chart with `6M`, `1Y`, and `ALL` ranges.
   - DCA performance chart with contribution markers.
   - Allocation chart by sector.
   - Holdings table, upcoming income, and editable monthly DCA plan.
2. **DCA Scanner** (`/scanner`)
   - Ticker/company search.
   - Market and strategy filters.
   - Ranked ticker cards with score, price, yield, pattern, and signals.
3. **Income Calendar** (`/calendar`)
   - Previous month, next month, and today controls.
   - Ex-dividend and payment events.
   - Monthly income and event summaries.

### Clickable Elements

- Sidebar page navigation.
- Portfolio chart range controls.
- Every ticker reference in holdings, plan, scanner, calendar, and recommendations.
- Add stock, increment amount, decrement amount, and remove stock controls.
- Scanner search, market filters, and strategy filters.
- Calendar month navigation and event chips.
- Research tabs: Overview, Analysis, Financials, Calendar, Market.
- Add to Plan and Remove from Plan.
- Explicit AI actions; AI never runs during ordinary page loading.
- Modal close button and backdrop.

### Modal

`ResearchModal` is a centered, ticker-driven modal with a blurred backdrop. It closes
with Escape, backdrop click, or its close button; inside clicks never close it. Opening
it locks body scrolling. Its query keys include the ticker so switching from KO to SCHD
cannot display stale KO data.

### Charts

- `PortfolioPerformanceChart`: time-series area chart and cost basis.
- `DcaPerformanceChart`: portfolio value with persisted DCA contribution markers.
- `AllocationChart`: sector allocation donut.
- `TickerPerformanceChart`: ticker-specific price history in the research modal.

All charts use Recharts, API data, responsive containers, tooltips, grid/axes, and
explicit loading, empty, and error states.

## Component Hierarchy

```text
App
├── QueryClientProvider
├── BrowserRouter
├── AppShell
│   ├── Sidebar
│   │   ├── Brand
│   │   ├── PrimaryNavigation
│   │   └── PortfolioMiniCard
│   ├── PageHeader
│   └── Outlet
│       ├── DashboardPage
│       │   ├── MetricGrid
│       │   ├── PortfolioPerformanceChart
│       │   ├── DcaPerformanceChart
│       │   ├── AllocationChart
│       │   ├── HoldingsTable
│       │   ├── UpcomingIncome
│       │   └── MonthlyPlan
│       ├── ScannerPage
│       │   ├── ScannerToolbar
│       │   └── TickerCandidateList
│       └── IncomeCalendarPage
│           ├── CalendarToolbar
│           └── DividendCalendar
└── ResearchModalProvider
    └── ResearchModal
        ├── ResearchHeader
        ├── TickerPerformanceChart
        ├── ScoreCards
        ├── BeginnerExplanation
        ├── KeyInsights
        └── PlanMutationButton
```

## Persistence Schema

- `Ticker`: canonical symbol metadata fetched from the market provider.
- `ChartPoint`: provider price history cached by ticker/date.
- `PlanItem`: persisted user plan membership and DCA amount.
- `StrategySummary`: persisted calculated strategy result per ticker.
- `PortfolioPoint`: persisted portfolio history used by dashboard charts.
- `DcaContribution`: persisted DCA event and chart marker.

SQLite is used locally through Prisma. The schema remains PostgreSQL-compatible except
for the datasource provider line.

## API Contract

### `GET /api/dashboard?range=1y`

Returns portfolio metrics, portfolio history, DCA history, allocation, holdings,
upcoming income, plan items, and strategy summaries.

### `GET /api/tickers?query=&market=&strategy=&page=1&limit=20`

Returns a paginated ticker list. Search hydrates symbols from the live market provider
and persists canonical metadata; pagination is applied by the database.

### `GET /api/tickers/:symbol`

Returns live quote data, strategy/risk/DCA scores, beginner explanation, insights,
fundamentals, and plan membership.

### `GET /api/tickers/:symbol/chart?range=1y`

Returns dated provider chart points. Points are persisted and refreshed as a coherent
series, never randomly generated.

### `GET /api/plan`

Returns persisted plan items joined to ticker metadata.

### `POST /api/plan`

Validates `{ symbol, monthlyAmount? }`, resolves the live ticker, and persists it.

### `DELETE /api/plan/:symbol`

Removes the symbol from the persistent plan and returns `204`.

## Error Contract

All errors use `{ error: { code, message, retryable } }`. Upstream market failures use
`502`; unavailable cached data uses `503`; validation errors use `400`; unknown symbols
use `404`. The frontend exposes loading, empty, error, and explicit retry states for
every query.
