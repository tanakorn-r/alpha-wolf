package http

import (
	"database/sql"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"alpha-wolf/apps/go-api/internal/analysis"
	"alpha-wolf/apps/go-api/internal/config"
	"alpha-wolf/apps/go-api/internal/finfeed"
	"alpha-wolf/apps/go-api/internal/market"
	"alpha-wolf/apps/go-api/internal/types"
)

type Handler struct {
	cfg        config.Config
	client     *finfeed.Client
	market     *market.Service
	aiAnalysis *analysis.Service
}

func NewHandler(cfg config.Config, db *sql.DB) *Handler {
	return &Handler{
		cfg:        cfg,
		client:     finfeed.NewClient(cfg),
		market:     market.NewService(cfg, db),
		aiAnalysis: analysis.NewService(cfg),
	}
}

func (h *Handler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"backend": "gin",
		"source":  "finfeed",
	})
}

func (h *Handler) ListThailandStocks(c *gin.Context) {
	limit := parseLimit(c.Query("limit"))
	exchangeID, err := h.resolveThailandExchangeID()
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	stocks, err := h.client.ListStocksByExchange(exchangeID, limit)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"country":    "TH",
		"exchangeId": exchangeID,
		"count":      len(stocks),
		"items":      stocks,
	})
}

func (h *Handler) GetThailandStockPrice(c *gin.Context) {
	symbol := strings.ToUpper(strings.TrimSpace(c.Param("symbol")))
	if symbol == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "symbol is required"})
		return
	}

	price, err := h.client.GetPrice(symbol)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"country": "TH",
		"item":    price,
	})
}

// GetDeepAnalysis serves the Deep AI panel: a live quote plus 30-day candles
// from FinFeed, turned into an entry/stop/target/risk-reward read. Works for
// any symbol format FinFeed accepts (US tickers, AOT.BK, 0700.HK, etc.) —
// not just Thailand listings.
func (h *Handler) GetDeepAnalysis(c *gin.Context) {
	symbol := strings.ToUpper(strings.TrimSpace(c.Param("symbol")))
	if symbol == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "symbol is required"})
		return
	}

	price, err := h.client.GetPrice(symbol)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	candles, err := h.client.GetCandles(symbol, 30)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, analysis.Compute(price, candles))
}

func (h *Handler) Catalog(c *gin.Context) {
	c.JSON(http.StatusOK, h.market.EnsureCatalog())
}

func (h *Handler) Presets(c *gin.Context) {
	c.JSON(http.StatusOK, h.market.Presets(c.Query("kind"), c.Query("region")))
}

func (h *Handler) Stocks(c *gin.Context) {
	c.JSON(http.StatusOK, h.market.Stocks(defaultStrategy(c.Query("strategy")), c.DefaultQuery("region", "all"), c.Query("q"), parsePage(c.Query("page")), parseLimit(c.Query("limit"))))
}

func (h *Handler) Dashboard(c *gin.Context) {
	c.JSON(http.StatusOK, h.market.Dashboard(defaultStrategy(c.Query("strategy")), parsePage(c.Query("page")), parseLimit(c.Query("limit"))))
}

func (h *Handler) Radar(c *gin.Context) {
	c.JSON(http.StatusOK, h.market.Radar(defaultStrategy(c.Query("strategy")), c.DefaultQuery("region", "all"), parsePage(c.Query("page")), parseLimit(c.Query("limit"))))
}

func (h *Handler) Discover(c *gin.Context) {
	c.JSON(http.StatusOK, h.market.Discover(c.Query("q"), c.DefaultQuery("kind", "all"), defaultStrategy(c.Query("strategy")), c.DefaultQuery("region", "all"), parsePage(c.Query("page")), parseLimit(c.Query("limit"))))
}

func (h *Handler) Quote(c *gin.Context) {
	record, err := h.market.Quote(c.Param("symbol"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, record)
}

func (h *Handler) Detail(c *gin.Context) {
	record, err := h.market.Detail(c.Param("symbol"), defaultStrategy(c.Query("strategy")))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, record)
}

func (h *Handler) DetailFinancials(c *gin.Context) {
	c.JSON(http.StatusOK, h.market.Financials(c.Param("symbol")))
}

func (h *Handler) DetailInsights(c *gin.Context) {
	record, err := h.market.Detail(c.Param("symbol"), defaultStrategy(c.Query("strategy")))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"sectorInsight":   record["sectorInsight"],
		"industryInsight": record["industryInsight"],
	})
}

func (h *Handler) DetailMarketComparison(c *gin.Context) {
	record, err := h.market.MarketComparison(strings.ToUpper(strings.TrimSpace(c.Param("symbol"))))
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, record)
}

func (h *Handler) Analysis(c *gin.Context) {
	strategy := strategyFromBody(c)
	detail, err := h.market.Detail(c.Param("symbol"), strategy)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": err.Error()})
		return
	}
	result, err := h.aiAnalysis.Summary(c.Param("symbol"), strategy, detail)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *Handler) QuantAnalysis(c *gin.Context) {
	strategy := strategyFromBody(c)
	detail, err := h.market.Detail(c.Param("symbol"), strategy)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": err.Error()})
		return
	}
	result, err := h.aiAnalysis.Quant(c.Param("symbol"), strategy, detail)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *Handler) TodayAnalysis(c *gin.Context) {
	strategy := strategyFromBody(c)
	detail, err := h.market.Detail(c.Param("symbol"), strategy)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": err.Error()})
		return
	}
	result, err := h.aiAnalysis.Today(c.Param("symbol"), strategy, detail)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *Handler) Portfolio(c *gin.Context) {
	dashboard, err := h.market.Portfolio()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, dashboard)
}

func (h *Handler) SaveHolding(c *gin.Context) {
	var payload types.HoldingInput
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	result, err := h.market.SaveHolding(payload)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *Handler) DeleteHolding(c *gin.Context) {
	if err := h.market.DeleteHolding(c.Param("symbol")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) SaveDcaOrder(c *gin.Context) {
	var payload types.DcaOrderInput
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	result, err := h.market.SaveOrder(payload)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, result)
}

func (h *Handler) UpdateDcaOrder(c *gin.Context) {
	var payload struct {
		Amount float64 `json:"amount"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	id, _ := strconv.Atoi(c.Param("id"))
	result, err := h.market.UpdateOrderAmount(id, payload.Amount)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *Handler) DeleteDcaOrder(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if err := h.market.DeleteOrder(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) MarketSnapshot(c *gin.Context) {
	c.JSON(http.StatusOK, h.market.MarketSnapshot(c.Param("market")))
}

func (h *Handler) Calendar(c *gin.Context) {
	c.JSON(http.StatusOK, h.market.Calendar(c.Query("month"), c.DefaultQuery("region", "us")))
}

func (h *Handler) SectorInsight(c *gin.Context) {
	c.JSON(http.StatusOK, h.market.SectorInsight(c.Param("sector")))
}

func (h *Handler) IndustryInsight(c *gin.Context) {
	c.JSON(http.StatusOK, h.market.IndustryInsight(c.Param("industry")))
}

func (h *Handler) resolveThailandExchangeID() (string, error) {
	if strings.TrimSpace(h.cfg.ThExchangeIDs) != "" {
		parts := strings.Split(h.cfg.ThExchangeIDs, ",")
		if len(parts) > 0 && strings.TrimSpace(parts[0]) != "" {
			return strings.TrimSpace(parts[0]), nil
		}
	}

	exchanges, err := h.client.ListExchanges()
	if err != nil {
		return "", err
	}

	for _, exchange := range exchanges {
		if exchange.CountryCode == "TH" || strings.EqualFold(exchange.Country, "Thailand") {
			return exchange.ID, nil
		}
	}

	return "", fmt.Errorf("could not find Thailand exchange id from FinFeed metadata; set FINFEED_TH_EXCHANGE_IDS")
}

func parseLimit(raw string) int {
	if strings.TrimSpace(raw) == "" {
		return 100
	}

	limit, err := strconv.Atoi(raw)
	if err != nil || limit <= 0 {
		return 100
	}
	if limit > 1000 {
		return 1000
	}

	return limit
}

func parsePage(raw string) int {
	page, err := strconv.Atoi(raw)
	if err != nil || page < 1 {
		return 1
	}
	return page
}

func defaultStrategy(value string) string {
	switch value {
	case "stable_dca", "yield", "momentum", "capitalized":
		return value
	default:
		return "capitalized"
	}
}

func strategyFromBody(c *gin.Context) string {
	var payload map[string]any
	if err := c.ShouldBindJSON(&payload); err == nil {
		if value, ok := payload["strategy"].(string); ok {
			return defaultStrategy(value)
		}
	}
	return "capitalized"
}
