package market

import (
	"math"
	"strconv"
	"strings"
	"time"

	"alpha-wolf/apps/go-api/internal/finfeed"
)

func scoreStrategies(price, changePct, weeklyTrend, monthlyTrend, quarterTrend float64, record catalogRecord) map[string]any {
	volatilityPenalty := clamp(100-math.Abs(changePct)*12, 0, 100)
	momentum := clamp(50+weeklyTrend*2.2+monthlyTrend*1.4, 0, 100)
	yield := clamp(55+volatilityPenalty*0.2-monthlyTrend*0.3, 0, 100)
	stable := clamp(volatilityPenalty*0.55+55-math.Abs(weeklyTrend)*0.6, 0, 100)
	capitalized := clamp(52+monthlyTrend*0.8+quarterTrend*0.6, 0, 100)
	if record.Region == "th" {
		stable += 4
		yield += 3
	}
	return map[string]any{
		"capitalized": int(math.Round(capitalized)),
		"stable_dca":  int(math.Round(stable)),
		"yield":       int(math.Round(yield)),
		"momentum":    int(math.Round(momentum)),
	}
}

func bestStrategy(scores map[string]any) (string, float64) {
	bestKey := "capitalized"
	bestValue := numberAt(scores, "capitalized")
	for _, key := range []string{"stable_dca", "yield", "momentum"} {
		value := numberAt(scores, key)
		if value > bestValue {
			bestKey = key
			bestValue = value
		}
	}
	return bestKey, bestValue
}

func recommendationFromBestStrategy(strategy string, score float64) string {
	switch strategy {
	case "yield":
		return "Best for income: Yield setup is around " + intString(score) + "% fit."
	case "momentum":
		return "Best for trend: Momentum setup is around " + intString(score) + "% fit."
	case "stable_dca":
		return "Best for recurring buys: Stable DCA setup is around " + intString(score) + "% fit."
	default:
		return "Best for compounders: Capitalized setup is around " + intString(score) + "% fit."
	}
}

func storyFromStrategy(strategy string, score, monthlyTrend, weeklyTrend float64) string {
	switch strategy {
	case "yield":
		return "Calmer tape and income traits give this name " + intString(score) + "% yield fit."
	case "momentum":
		return roundString(weeklyTrend) + "% weekly move and " + intString(score) + "% trend fit keep momentum on watch."
	case "stable_dca":
		return "Calmer tape gives this name " + intString(score) + "% stable DCA fit."
	default:
		return roundString(monthlyTrend) + "% monthly trend and " + intString(score) + "% capitalized fit support long-horizon compounding."
	}
}

func strategyLabel(strategy string) string {
	switch strategy {
	case "stable_dca":
		return "Stable DCA"
	case "yield":
		return "Yield"
	case "momentum":
		return "Momentum"
	default:
		return "Capitalized"
	}
}

func buildNarrative(strategy string, top map[string]any) map[string]any {
	base := map[string]map[string]string{
		"capitalized": {"title": "Built for compounders", "summary": "Focus on durable businesses with scale and room to keep compounding.", "positive": "Upside can be powerful when quality stays intact.", "negative": "High expectations can compress quickly if growth cools.", "recommendation": "Prioritize the strongest compounders in the live universe."},
		"stable_dca":  {"title": "Best for recurring buys", "summary": "Prefer calmer names that make regular accumulation easier.", "positive": "Lower volatility can make buying discipline easier.", "negative": "The trade-off is often slower upside.", "recommendation": "Lean toward steadier names with calmer swings."},
		"yield":       {"title": "Income-first", "summary": "Optimize for cash return and resilience.", "positive": "Good income profiles can help through volatility.", "negative": "High yield is only attractive if it stays supported.", "recommendation": "Favor stronger payers with steadier profiles."},
		"momentum":    {"title": "Trend chaser", "summary": "Look for the clearest trend and strongest price action.", "positive": "Momentum can deliver sharp upside while the tape stays hot.", "negative": "It can reverse fast when conviction fades.", "recommendation": "Favor the strongest relative-strength leaders."},
	}
	current := base[strategy]
	if current == nil {
		current = base["capitalized"]
	}
	result := map[string]any{
		"title": current["title"], "summary": current["summary"], "positive": current["positive"], "negative": current["negative"], "recommendation": current["recommendation"],
	}
	if len(top) > 0 {
		result["recommendation"] = "Best current match: " + stringAt(top, "symbol") + " - " + intString(numberAt(top, "strategyScores", strategy)) + "% fit for " + strategyLabel(strategy)
	}
	return result
}

func buildTechnicals(candles []finfeed.Candle) map[string]any {
	closes := closeSlice(candles)
	sma20 := movingAverage(closes, 20)
	sma50 := movingAverage(closes, 50)
	sma200 := movingAverage(closes, 200)
	ema20 := ema(closes, 20)
	rsi14 := rsi(closes, 14)
	macdValue, macdSignal, histogram := macd(closes)
	support, resistance := swing(candles, 20)
	currentVolume := 0.0
	avgVolume := averageVolume(candles, 20)
	if len(candles) > 0 {
		currentVolume = candles[len(candles)-1].Volume
	}
	volumeRatio := 0.0
	if avgVolume > 0 {
		volumeRatio = currentVolume / avgVolume
	}
	return map[string]any{
		"rsi14":         round2(rsi14),
		"macd":          round2(macdValue),
		"macdSignal":    round2(macdSignal),
		"macdHistogram": round2(histogram),
		"sma20":         round2(sma20),
		"sma50":         round2(sma50),
		"sma200":        round2(sma200),
		"ema20":         round2(ema20),
		"volatility":    round2(volatility(closes)),
		"avgVolume":     round2(avgVolume),
		"currentVolume": round2(currentVolume),
		"volumeRatio":   round2(volumeRatio),
		"support":       round2(support),
		"resistance":    round2(resistance),
		"trend": map[string]any{
			"week":    round2(trailingReturnDays(candles, 5)),
			"month":   round2(trailingReturnDays(candles, 21)),
			"quarter": round2(trailingReturnDays(candles, 63)),
		},
		"signal": technicalSignal(rsi14, macdValue, macdSignal, sma20, sma50),
	}
}

func buildPerformance(candles []finfeed.Candle, technicals map[string]any) map[string]any {
	returns := map[string]any{
		"ytd": round2(ytdReturn(candles)),
		"1y":  round2(trailingReturnDays(candles, 252)),
		"2y":  round2(trailingReturnDays(candles, 504)),
		"3y":  round2(trailingReturnDays(candles, 756)),
		"4y":  round2(trailingReturnDays(candles, 1008)),
	}
	line := []float64{}
	for _, candle := range lastCandles(candles, 20) {
		line = append(line, round2(candle.Close))
	}
	return map[string]any{
		"trend":         stringAt(technicals, "signal"),
		"momentumScore": int(math.Round(clamp(50+numberAt(technicals, "trend", "month")*1.2, 0, 100))),
		"returns":       returns,
		"line":          line,
	}
}

func buildBusiness(record map[string]any, performance map[string]any) map[string]any {
	returns := mapAt(performance, "returns")
	return map[string]any{
		"sector":          stringAt(record, "sector"),
		"industry":        stringAt(record, "industry"),
		"marketCap":       record["marketCap"],
		"enterpriseValue": nil,
		"peRatio":         nil,
		"priceToBook":     nil,
		"roe":             nil,
		"roa":             nil,
		"profitMargin":    nil,
		"operatingMargin": nil,
		"grossMargin":     nil,
		"revenueGrowth":   nil,
		"earningsGrowth":  nil,
		"dividendYield":   record["dividendYield"],
		"payoutRatio":     nil,
		"debtToEquity":    nil,
		"beta":            nil,
		"ytdReturn":       returns["ytd"],
		"oneYearReturn":   returns["1y"],
		"twoYearReturn":   returns["2y"],
		"threeYearReturn": returns["3y"],
		"fourYearReturn":  returns["4y"],
		"analystRating":   nil,
		"analystScore":    nil,
		"targetMeanPrice": nil,
		"currentPrice":    record["price"],
		"companySummary":  stringAt(record, "story"),
	}
}

func verdictAction(score float64) string {
	if score >= 78 {
		return "BUY"
	}
	if score >= 60 {
		return "WAIT"
	}
	return "PASS"
}

func confidenceFromScore(score float64) string {
	if score >= 88 {
		return "Very high"
	}
	if score >= 76 {
		return "High"
	}
	if score >= 62 {
		return "Balanced"
	}
	return "Speculative"
}

func sparkline(candles []finfeed.Candle) []float64 {
	points := []float64{}
	for _, candle := range lastCandles(candles, 30) {
		points = append(points, round2(candle.Close))
	}
	return points
}

func historyRecords(candles []finfeed.Candle) []map[string]any {
	rows := []map[string]any{}
	for _, candle := range candles {
		rows = append(rows, map[string]any{
			"date":   candle.Date,
			"close":  round2(candle.Close),
			"volume": round2(candle.Volume),
			"high":   round2(candle.High),
			"low":    round2(candle.Low),
			"open":   round2(candle.Open),
		})
	}
	return rows
}

func alignComparison(stock, benchmark, peer []finfeed.Candle) []map[string]any {
	maxLen := minInt(minInt(len(stock), len(benchmark)), len(peer))
	if maxLen == 0 {
		return []map[string]any{}
	}
	stock = stock[len(stock)-maxLen:]
	benchmark = benchmark[len(benchmark)-maxLen:]
	peer = peer[len(peer)-maxLen:]
	stockBase := stock[0].Close
	benchmarkBase := benchmark[0].Close
	peerBase := peer[0].Close
	points := []map[string]any{}
	for index := 0; index < maxLen; index++ {
		points = append(points, map[string]any{
			"date":      stock[index].Date,
			"stock":     round2(indexedReturn(stock[index].Close, stockBase)),
			"benchmark": round2(indexedReturn(benchmark[index].Close, benchmarkBase)),
			"peer":      round2(indexedReturn(peer[index].Close, peerBase)),
		})
	}
	return points
}

func indexedReturn(value, base float64) float64 {
	if base <= 0 {
		return 100
	}
	return value / base * 100
}

func trailingReturn(candles []finfeed.Candle) float64 {
	if len(candles) < 2 {
		return 0
	}
	return pct(candles[len(candles)-1].Close, candles[0].Close)
}

func trailingReturnDays(candles []finfeed.Candle, window int) float64 {
	if len(candles) == 0 {
		return 0
	}
	if window >= len(candles) {
		window = len(candles) - 1
	}
	if window <= 0 {
		return 0
	}
	return pct(candles[len(candles)-1].Close, candles[len(candles)-1-window].Close)
}

func ytdReturn(candles []finfeed.Candle) float64 {
	if len(candles) == 0 {
		return 0
	}
	year := time.Now().UTC().Year()
	base := candles[0].Close
	for _, candle := range candles {
		parsed, err := time.Parse("2006-01-02", trimDate(candle.Date))
		if err == nil && parsed.Year() == year {
			base = candle.Close
			break
		}
	}
	return pct(candles[len(candles)-1].Close, base)
}

func trimDate(value string) string {
	if len(value) >= 10 {
		return value[:10]
	}
	return value
}

func technicalSignal(rsi, macdValue, macdSignal, sma20, sma50 float64) string {
	if rsi > 70 && macdValue < macdSignal {
		return "bearish"
	}
	if rsi < 35 && macdValue > macdSignal {
		return "bullish"
	}
	if sma20 > sma50 {
		return "bullish"
	}
	return "neutral"
}

func closeSlice(candles []finfeed.Candle) []float64 {
	values := []float64{}
	for _, candle := range candles {
		if candle.Close > 0 {
			values = append(values, candle.Close)
		}
	}
	return values
}

func movingAverage(values []float64, window int) float64 {
	if len(values) < window || window <= 0 {
		return 0
	}
	sum := 0.0
	for _, value := range values[len(values)-window:] {
		sum += value
	}
	return sum / float64(window)
}

func ema(values []float64, window int) float64 {
	if len(values) == 0 || window <= 0 {
		return 0
	}
	multiplier := 2.0 / float64(window+1)
	result := values[0]
	for _, value := range values[1:] {
		result = ((value - result) * multiplier) + result
	}
	return result
}

func rsi(values []float64, window int) float64 {
	if len(values) <= window {
		return 50
	}
	gains := 0.0
	losses := 0.0
	for index := len(values) - window; index < len(values); index++ {
		diff := values[index] - values[index-1]
		if diff > 0 {
			gains += diff
		} else {
			losses -= diff
		}
	}
	if losses == 0 {
		return 100
	}
	rs := (gains / float64(window)) / (losses / float64(window))
	return 100 - (100 / (1 + rs))
}

func macd(values []float64) (float64, float64, float64) {
	if len(values) < 35 {
		return 0, 0, 0
	}
	var macdSeries []float64
	for index := range values {
		subset := values[:index+1]
		macdSeries = append(macdSeries, ema(subset, 12)-ema(subset, 26))
	}
	signal := ema(macdSeries, 9)
	last := macdSeries[len(macdSeries)-1]
	return last, signal, last - signal
}

func averageVolume(candles []finfeed.Candle, window int) float64 {
	if len(candles) == 0 {
		return 0
	}
	candles = lastCandles(candles, window)
	sum := 0.0
	for _, candle := range candles {
		sum += candle.Volume
	}
	return sum / float64(len(candles))
}

func swing(candles []finfeed.Candle, window int) (float64, float64) {
	candles = lastCandles(candles, window)
	if len(candles) == 0 {
		return 0, 0
	}
	low, high := candles[0].Low, candles[0].High
	for _, candle := range candles {
		if candle.Low < low {
			low = candle.Low
		}
		if candle.High > high {
			high = candle.High
		}
	}
	return low, high
}

func volatility(values []float64) float64 {
	if len(values) < 2 {
		return 0
	}
	return math.Abs(pct(values[len(values)-1], values[len(values)-2]))
}

func lastCandles(candles []finfeed.Candle, limit int) []finfeed.Candle {
	if limit <= 0 || len(candles) <= limit {
		return candles
	}
	return candles[len(candles)-limit:]
}

func firstDifferent(items []map[string]any, symbol, sector string) map[string]any {
	for _, item := range items {
		if strings.EqualFold(stringAt(item, "symbol"), symbol) {
			continue
		}
		if sector != "" && !strings.EqualFold(stringAt(item, "sector"), sector) {
			continue
		}
		return item
	}
	if len(items) > 0 {
		return items[0]
	}
	return map[string]any{"symbol": symbol, "name": symbol}
}

func inferRegion(symbol string) string {
	if strings.HasSuffix(strings.ToUpper(symbol), ".BK") {
		return "th"
	}
	return "us"
}

func marketLabel(symbol string) string {
	if inferRegion(symbol) == "th" {
		return "Thai SET"
	}
	return "US"
}

func regionExchange(region string) string {
	if region == "th" {
		return "SET"
	}
	return "US"
}

func inferSector(symbol, name string) string {
	upper := strings.ToUpper(symbol + " " + name)
	switch {
	case strings.Contains(upper, "BANK"), strings.Contains(upper, "FINANCE"), strings.Contains(upper, "SCB"), strings.Contains(upper, "BBL"), strings.Contains(upper, "KBANK"), strings.Contains(upper, "BAY"):
		return "Financial Services"
	case strings.Contains(upper, "ENERGY"), strings.Contains(upper, "OIL"), strings.Contains(upper, "PTT"), strings.Contains(upper, "EXXON"), strings.Contains(upper, "CHEVRON"):
		return "Energy"
	case strings.Contains(upper, "TECH"), strings.Contains(upper, "NVIDIA"), strings.Contains(upper, "APPLE"), strings.Contains(upper, "MICRO"), strings.Contains(upper, "GOOG"), strings.Contains(upper, "META"):
		return "Technology"
	case strings.Contains(upper, "REIT"), strings.Contains(upper, "PROPERTY"), strings.Contains(upper, "REAL ESTATE"):
		return "Real Estate"
	case strings.Contains(upper, "FOOD"), strings.Contains(upper, "BEVERAGE"), strings.Contains(upper, "COKE"), strings.Contains(upper, "PEPSI"):
		return "Consumer Defensive"
	default:
		return "Unknown"
	}
}

func inferIndustry(symbol, name string) string {
	sector := inferSector(symbol, name)
	switch sector {
	case "Financial Services":
		return "Banks - Regional"
	case "Technology":
		return "Software - Infrastructure"
	case "Energy":
		return "Oil & Gas"
	case "Consumer Defensive":
		return "Beverages"
	case "Real Estate":
		return "REITs"
	default:
		return sector
	}
}

func choose(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func currencyForSymbol(symbol string) string {
	if inferRegion(symbol) == "th" {
		return "THB"
	}
	return "USD"
}

func firstRecord(items []map[string]any) map[string]any {
	if len(items) == 0 {
		return map[string]any{}
	}
	return items[0]
}

func cloneMap(value map[string]any) map[string]any {
	clone := map[string]any{}
	for key, item := range value {
		clone[key] = item
	}
	return clone
}

func mapAt(value map[string]any, key string) map[string]any {
	if nested, ok := value[key].(map[string]any); ok {
		return nested
	}
	return map[string]any{}
}

func stringAt(value map[string]any, keys ...string) string {
	current := any(value)
	for _, key := range keys {
		if object, ok := current.(map[string]any); ok {
			current = object[key]
			continue
		}
		return ""
	}
	if result, ok := current.(string); ok {
		return result
	}
	return ""
}

func numberAt(value map[string]any, keys ...string) float64 {
	current := any(value)
	for _, key := range keys {
		if object, ok := current.(map[string]any); ok {
			current = object[key]
			continue
		}
		return 0
	}
	switch number := current.(type) {
	case int:
		return float64(number)
	case int64:
		return float64(number)
	case float64:
		return number
	case float32:
		return float64(number)
	}
	return 0
}

func pct(current, previous float64) float64 {
	if previous == 0 {
		return 0
	}
	return ((current - previous) / previous) * 100
}

func round2(value float64) float64 {
	return math.Round(value*100) / 100
}

func intString(value float64) string {
	return fmtInt(int(math.Round(value)))
}

func roundString(value float64) string {
	return fmtFloat(round2(value))
}

func fmtInt(value int) string {
	return strconv.Itoa(value)
}

func fmtFloat(value float64) string {
	return strconv.FormatFloat(value, 'f', -1, 64)
}

func isoDate(value string) string {
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return parsed.Format("2006-01-02")
	}
	if len(value) >= 10 {
		return value[:10]
	}
	return value
}

func clamp(value, low, high float64) float64 {
	if value < low {
		return low
	}
	if value > high {
		return high
	}
	return value
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
