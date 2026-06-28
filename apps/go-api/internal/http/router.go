package http

import (
	"net/http"
	"os"
	"path/filepath"
	"runtime"

	"github.com/gin-gonic/gin"

	"alpha-wolf/apps/go-api/internal/config"
)

func NewRouter(cfg config.Config) *gin.Engine {
	router := gin.Default()
	handler := NewHandler(cfg)

	router.GET("/health", handler.Health)
	router.GET("/swagger", serveSwaggerUI)
	router.GET("/swagger/openapi.yaml", serveOpenAPI)

	api := router.Group("/api/v1")
	{
		api.GET("/th/stocks", handler.ListThailandStocks)
		api.GET("/th/stocks/:symbol/price", handler.GetThailandStockPrice)
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
