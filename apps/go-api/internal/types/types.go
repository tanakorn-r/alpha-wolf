package types

type StrategyKey string

const (
	StrategyCapitalized StrategyKey = "capitalized"
	StrategyStableDCA   StrategyKey = "stable_dca"
	StrategyYield       StrategyKey = "yield"
	StrategyMomentum    StrategyKey = "momentum"
)

type HoldingInput struct {
	Symbol      string  `json:"symbol"`
	Shares      float64 `json:"shares"`
	AverageCost float64 `json:"averageCost"`
	Strategy    string  `json:"strategy"`
	MonthlyDca  float64 `json:"monthlyDca"`
}

type Holding struct {
	ID          int     `json:"id"`
	Symbol      string  `json:"symbol"`
	Shares      float64 `json:"shares"`
	AverageCost float64 `json:"averageCost"`
	Strategy    string  `json:"strategy"`
	MonthlyDca  float64 `json:"monthlyDca"`
	CreatedAt   string  `json:"createdAt"`
}

type DcaOrderInput struct {
	Symbol       string  `json:"symbol"`
	Amount       float64 `json:"amount"`
	ScheduledFor string  `json:"scheduledFor"`
	Strategy     string  `json:"strategy"`
	Status       string  `json:"status"`
}

type DcaOrder struct {
	ID            int      `json:"id"`
	Symbol        string   `json:"symbol"`
	Amount        float64  `json:"amount"`
	ScheduledFor  string   `json:"scheduledFor"`
	Strategy      string   `json:"strategy"`
	Status        string   `json:"status"`
	ExecutedPrice *float64 `json:"executedPrice,omitempty"`
	Shares        *float64 `json:"shares,omitempty"`
	CreatedAt     string   `json:"createdAt"`
}

type PortfolioPoint struct {
	Date  string  `json:"date"`
	Value float64 `json:"value"`
	Cost  float64 `json:"cost"`
}

type PortfolioMarker struct {
	Date   string  `json:"date"`
	Symbol string  `json:"symbol"`
	Amount float64 `json:"amount"`
}

type IncomeEvent struct {
	Date   string   `json:"date"`
	Symbol string   `json:"symbol"`
	Kind   string   `json:"kind"`
	Amount *float64 `json:"amount,omitempty"`
}

type PortfolioSummary struct {
	TotalValue   float64 `json:"totalValue"`
	Invested     float64 `json:"invested"`
	GainLoss     float64 `json:"gainLoss"`
	GainLossPct  float64 `json:"gainLossPct"`
	DividendsYTD float64 `json:"dividendsYtd"`
	ForwardYield float64 `json:"forwardYield"`
}

type PortfolioDashboard struct {
	Summary      PortfolioSummary  `json:"summary"`
	Holdings     []map[string]any  `json:"holdings"`
	DcaOrders    []DcaOrder        `json:"dcaOrders"`
	Chart        []PortfolioPoint  `json:"chart"`
	Markers      []PortfolioMarker `json:"markers"`
	IncomeEvents []IncomeEvent     `json:"incomeEvents"`
}

type MarketCalendarEvent struct {
	Date        string   `json:"date"`
	Symbol      string   `json:"symbol"`
	Name        string   `json:"name"`
	Kind        string   `json:"kind"`
	Region      string   `json:"region"`
	MarketLabel string   `json:"marketLabel"`
	IsHolding   bool     `json:"isHolding"`
	Amount      *float64 `json:"amount,omitempty"`
	Note        *string  `json:"note,omitempty"`
}

type MarketCalendarResponse struct {
	Month   string `json:"month"`
	Region  string `json:"region"`
	Summary struct {
		TotalEvents   int     `json:"totalEvents"`
		HoldingEvents int     `json:"holdingEvents"`
		UsEvents      int     `json:"usEvents"`
		ThEvents      int     `json:"thEvents"`
		PaymentsTotal float64 `json:"paymentsTotal"`
	} `json:"summary"`
	Events []MarketCalendarEvent `json:"events"`
}

type StockRecord map[string]any
