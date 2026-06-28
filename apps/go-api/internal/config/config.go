package config

import (
	"bufio"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

type Config struct {
	Port                 string
	FinFeedAPIKey        string
	FinFeedBaseURL       string
	FinFeedExchangesPath string
	FinFeedSymbolsPath   string
	FinFeedPricePath     string
	ThailandExchangeID   string
}

func Load() Config {
	loadDotEnv()

	return Config{
		Port:                 getEnv("PORT", "8080"),
		FinFeedAPIKey:        strings.TrimSpace(os.Getenv("FINFEED_API_KEY")),
		FinFeedBaseURL:       strings.TrimRight(getEnv("FINFEED_BASE_URL", "https://api.finfeedapi.com"), "/"),
		FinFeedExchangesPath: ensureLeadingSlash(getEnv("FINFEED_EXCHANGES_PATH", "/metadata/exchanges")),
		FinFeedSymbolsPath:   ensureLeadingSlash(getEnv("FINFEED_SYMBOLS_PATH_TEMPLATE", "/metadata/symbols/{exchange_id}")),
		FinFeedPricePath:     ensureLeadingSlash(getEnv("FINFEED_PRICE_PATH_TEMPLATE", "/price/{symbol}")),
		ThailandExchangeID:   strings.TrimSpace(os.Getenv("FINFEED_TH_EXCHANGE_ID")),
	}
}

func (c Config) ListenAddress() string {
	return ":" + c.Port
}

func getEnv(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	return value
}

func ensureLeadingSlash(value string) string {
	if strings.HasPrefix(value, "/") {
		return value
	}

	return "/" + value
}

func loadDotEnv() {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		return
	}

	envPath := filepath.Join(filepath.Dir(currentFile), "..", "..", ".env")
	file, err := os.Open(envPath)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		key, value, found := strings.Cut(line, "=")
		if !found {
			continue
		}

		key = strings.TrimSpace(key)
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		if key == "" || os.Getenv(key) != "" {
			continue
		}

		_ = os.Setenv(key, value)
	}
}
