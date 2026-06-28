package finfeed

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"alpha-wolf/apps/go-api/internal/config"
)

type Client struct {
	baseURL       string
	apiKey        string
	exchangesPath string
	symbolsPath   string
	pricePath     string
	httpClient    *http.Client
}

func NewClient(cfg config.Config) *Client {
	return &Client{
		baseURL:       cfg.FinFeedBaseURL,
		apiKey:        cfg.FinFeedAPIKey,
		exchangesPath: cfg.FinFeedExchangesPath,
		symbolsPath:   cfg.FinFeedSymbolsPath,
		pricePath:     cfg.FinFeedPricePath,
		httpClient: &http.Client{
			Timeout: 20 * time.Second,
		},
	}
}

func (c *Client) ListExchanges() ([]Exchange, error) {
	payload, err := c.getJSON(c.exchangesPath, nil)
	if err != nil {
		return nil, err
	}

	exchanges := make([]Exchange, 0)
	for _, item := range readArray(payload) {
		exchanges = append(exchanges, Exchange{
			ID:          firstString(item, "id", "exchangeId", "exchange_id"),
			Code:        firstString(item, "code", "symbol", "mic", "exchangeCode"),
			Name:        firstString(item, "name", "exchangeName", "description"),
			Country:     firstString(item, "country", "countryName"),
			CountryCode: strings.ToUpper(firstString(item, "countryCode", "country_code")),
			Region:      firstString(item, "region"),
		})
	}

	return exchanges, nil
}

func (c *Client) ListStocksByExchange(exchangeID string, limit int) ([]Stock, error) {
	path := strings.ReplaceAll(c.symbolsPath, "{exchange_id}", url.PathEscape(exchangeID))
	payload, err := c.getJSON(path, nil)
	if err != nil {
		return nil, err
	}

	stocks := make([]Stock, 0)
	for _, item := range readArray(payload) {
		if symbol := firstString(item, "symbol", "ticker", "code"); symbol != "" {
			stocks = append(stocks, Stock{
				Symbol:       symbol,
				Name:         firstString(item, "name", "companyName", "description"),
				ExchangeID:   firstString(item, "exchangeId", "exchange_id", "marketId"),
				ExchangeCode: firstString(item, "exchangeCode", "market", "mic"),
				Market:       firstString(item, "market", "marketName"),
				Currency:     firstString(item, "currency", "currencyCode"),
			})
		}
		if limit > 0 && len(stocks) >= limit {
			break
		}
	}

	return stocks, nil
}

func (c *Client) GetPrice(symbol string) (Price, error) {
	path := strings.ReplaceAll(c.pricePath, "{symbol}", url.PathEscape(strings.ToUpper(strings.TrimSpace(symbol))))
	payload, err := c.getJSON(path, nil)
	if err != nil {
		return Price{}, err
	}

	item := readObject(payload)
	return Price{
		Symbol:        firstString(item, "symbol", "ticker", "code"),
		Name:          firstString(item, "name", "companyName", "description"),
		Currency:      firstString(item, "currency", "currencyCode"),
		Price:         firstFloat(item, "price", "last", "lastPrice", "close"),
		Change:        firstFloat(item, "change", "delta", "priceChange"),
		ChangePercent: firstFloat(item, "changePercent", "change_percentage", "percentChange"),
		Timestamp:     firstString(item, "timestamp", "updatedAt", "lastUpdated"),
	}, nil
}

func (c *Client) getJSON(path string, query url.Values) (any, error) {
	if c.apiKey == "" {
		return nil, fmt.Errorf("missing FINFEED_API_KEY")
	}

	if query == nil {
		query = url.Values{}
	}
	query.Set("apikey", c.apiKey)

	endpoint := c.baseURL + path
	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.URL.RawQuery = query.Encode()

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode >= http.StatusBadRequest {
		return nil, fmt.Errorf("finfeed returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var payload any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("decode finfeed payload: %w", err)
	}

	return payload, nil
}

func readArray(payload any) []map[string]any {
	switch value := payload.(type) {
	case []any:
		rows := make([]map[string]any, 0, len(value))
		for _, row := range value {
			if item, ok := row.(map[string]any); ok {
				rows = append(rows, item)
			}
		}
		return rows
	case map[string]any:
		for _, key := range []string{"data", "results", "items", "symbols", "exchanges"} {
			if nested, ok := value[key].([]any); ok {
				rows := make([]map[string]any, 0, len(nested))
				for _, row := range nested {
					if item, ok := row.(map[string]any); ok {
						rows = append(rows, item)
					}
				}
				return rows
			}
		}
	}

	return nil
}

func readObject(payload any) map[string]any {
	if item, ok := payload.(map[string]any); ok {
		for _, key := range []string{"data", "result", "quote", "price"} {
			if nested, ok := item[key].(map[string]any); ok {
				return nested
			}
		}
		return item
	}

	rows := readArray(payload)
	if len(rows) > 0 {
		return rows[0]
	}

	return map[string]any{}
}

func firstString(item map[string]any, keys ...string) string {
	for _, key := range keys {
		if raw, ok := item[key]; ok {
			switch value := raw.(type) {
			case string:
				if strings.TrimSpace(value) != "" {
					return value
				}
			}
		}
	}

	return ""
}

func firstFloat(item map[string]any, keys ...string) float64 {
	for _, key := range keys {
		if raw, ok := item[key]; ok {
			switch value := raw.(type) {
			case float64:
				return value
			case float32:
				return float64(value)
			case int:
				return float64(value)
			case int64:
				return float64(value)
			case json.Number:
				parsed, err := value.Float64()
				if err == nil {
					return parsed
				}
			}
		}
	}

	return 0
}
