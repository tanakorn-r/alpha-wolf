package http

import (
	"database/sql"
	"net/http"
	"os"
	"path/filepath"
	"runtime"

	"github.com/gin-gonic/gin"

	"alpha-wolf/apps/go-api/internal/config"
)

func NewRouter(cfg config.Config, db *sql.DB) *gin.Engine {
	router := gin.Default()
	handler := NewHandler(cfg, db)

	router.GET("/health", handler.Health)
	router.GET("/swagger", serveSwaggerUI)
	router.GET("/swagger/openapi.yaml", serveOpenAPI)

	router.GET("/api/catalog", handler.Catalog)
	router.GET("/api/presets", handler.Presets)
	router.GET("/api/stocks", handler.Stocks)
	router.GET("/api/dashboard", handler.Dashboard)
	router.GET("/api/radar", handler.Radar)
	router.GET("/api/discover", handler.Discover)
	router.GET("/api/quote/:symbol", handler.Quote)
	router.GET("/api/details/:symbol", handler.Detail)
	router.GET("/api/details/:symbol/financials", handler.DetailFinancials)
	router.GET("/api/details/:symbol/insights", handler.DetailInsights)
	router.GET("/api/details/:symbol/market-comparison", handler.DetailMarketComparison)
	router.POST("/api/analysis/:symbol", handler.Analysis)
	router.POST("/api/analysis/:symbol/quant", handler.QuantAnalysis)
	router.POST("/api/analysis/:symbol/today", handler.TodayAnalysis)
	router.GET("/api/portfolio", handler.Portfolio)
	router.PUT("/api/portfolio/holdings", handler.SaveHolding)
	router.DELETE("/api/portfolio/holdings/:symbol", handler.DeleteHolding)
	router.POST("/api/portfolio/dca-orders", handler.SaveDcaOrder)
	router.PATCH("/api/portfolio/dca-orders/:id", handler.UpdateDcaOrder)
	router.DELETE("/api/portfolio/dca-orders/:id", handler.DeleteDcaOrder)
	router.GET("/api/market/:market", handler.MarketSnapshot)
	router.GET("/api/calendar", handler.Calendar)
	router.GET("/api/sectors/:sector", handler.SectorInsight)
	router.GET("/api/industries/:industry", handler.IndustryInsight)

	api := router.Group("/api/v1")
	{
		api.GET("/th/stocks", handler.ListThailandStocks)
		api.GET("/th/stocks/:symbol/price", handler.GetThailandStockPrice)
		api.GET("/stocks/:symbol/deep", handler.GetDeepAnalysis)
	}

	return router
}

func serveSwaggerUI(c *gin.Context) {
	bytes, err := readDocsFile("swagger.html")
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	}

	c.Data(http.StatusOK, "text/html; charset=utf-8", bytes)
}

func serveOpenAPI(c *gin.Context) {
	bytes, err := readDocsFile("openapi.yaml")
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	}

	c.Data(http.StatusOK, "application/yaml; charset=utf-8", bytes)
}

func readDocsFile(name string) ([]byte, error) {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		return nil, os.ErrNotExist
	}

	docsPath := filepath.Join(filepath.Dir(currentFile), "..", "..", "docs", name)
	return os.ReadFile(docsPath)
}
