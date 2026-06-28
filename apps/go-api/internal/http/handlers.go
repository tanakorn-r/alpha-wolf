package http

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"alpha-wolf/apps/go-api/internal/config"
	"alpha-wolf/apps/go-api/internal/finfeed"
)

type Handler struct {
	cfg    config.Config
	client *finfeed.Client
}

func NewHandler(cfg config.Config) *Handler {
	return &Handler{
		cfg:    cfg,
		client: finfeed.NewClient(cfg),
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

func (h *Handler) resolveThailandExchangeID() (string, error) {
	if h.cfg.ThailandExchangeID != "" {
		return h.cfg.ThailandExchangeID, nil
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

	return "", fmt.Errorf("could not find Thailand exchange id from FinFeed metadata; set FINFEED_TH_EXCHANGE_ID")
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
