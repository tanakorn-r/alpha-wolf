package market

import (
	"database/sql"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"alpha-wolf/apps/go-api/internal/cache"
	"alpha-wolf/apps/go-api/internal/config"
	"alpha-wolf/apps/go-api/internal/finfeed"
	"alpha-wolf/apps/go-api/internal/store"
	"alpha-wolf/apps/go-api/internal/types"
)

type Service struct {
	cfg       config.Config
	client    *finfeed.Client
	cache     *cache.Cache
	portfolio *store.PortfolioStore
}

func NewService(cfg config.Config, db *sql.DB) *Service {
	return &Service{
		cfg:       cfg,
		client:    finfeed.NewClient(cfg),
		cache:     cache.New(),
		portfolio: store.NewPortfolioStore(db),
	}
}

type catalogRecord struct {
	Symbol   string
	Name     string
	Currency string
	Exchange string
	Region   string
	Sector   string
	Industry string
}

func (s *Service) EnsureCatalog() map[string]any {
	records, fetchedAt, expiresAt, _ := s.catalog()
	counts := map[string]int{"us": 0, "th": 0}
	for _, record := range records {
		counts[record.Region]++
	}
	return map[string]any{
		"source":     "finfeed",
		"cacheHit":   true,
		"ttlSeconds": 86400,
		"counts":     counts,
		"fetchedAt":  map[string]string{"us": fetchedAt, "th": fetchedAt},
		"expiresAt":  map[string]string{"us": expiresAt, "th": expiresAt},
	}
}

func (s *Service) Presets(kind string, region string) []map[string]any {
	if kind != "" && kind != "stock" {
		return []map[string]any{}
	}
	records, _, _, _ := s.catalog()
	grouped := map[string][]string{"us": {}, "th": {}}
	for _, record := range records {
		grouped[record.Region] = append(grouped[record.Region], record.Symbol)
	}
	regions := []string{"us", "th"}
	if region == "us" || region == "th" {
		regions = []string{region}
	}
	response := []map[string]any{}
	for _, key := range regions {
		if len(grouped[key]) == 0 {
			continue
		}
		response = append(response, map[string]any{
			"code":      "stock_" + key + "_all",
			"kind":      "stock",
			"region":    key,
			"label":     map[string]string{"us": "US Stocks", "th": "Thai Stocks"}[key],
			"sortOrder": 1,
			"enabled":   true,
			"symbols":   grouped[key],
			"source":    "finfeed-24h-cache",
		})
	}
	return response
}

func (s *Service) Stocks(strategy, region, query string, page, limit int) map[string]any {
	items, totalPages, total := s.buildMarketPage(strategy, region, query, page, limit)
	return map[string]any{
		"stocks":     items,
		"page":       page,
		"limit":      limit,
		"total":      total,
		"totalPages": totalPages,
	}
}

func (s *Service) Dashboard(strategy string, page, limit int) map[string]any {
	items, totalPages, total := s.buildMarketPage(strategy, "all", "", page, limit)
	var score int
	confidence := "Balanced"
	recommendation := "No live match yet"
	if len(items) > 0 {
		score = int(numberAt(items[0], "strategyScores", strategy))
		confidence = confidenceFromScore(float64(score))
		recommendation = fmt.Sprintf("Best current match: %s - %s", stringAt(items[0], "symbol"), stringAt(items[0], "recommendation"))
	}
	return map[string]any{
		"stocks":     items,
		"page":       page,
		"limit":      limit,
		"total":      total,
		"totalPages": totalPages,
		"performance": map[string]any{
			"score":          score,
			"confidence":     confidence,
			"recommendation": recommendation,
		},
		"narrative": buildNarrative(strategy, firstRecord(items)),
	}
}

func (s *Service) Radar(strategy, region string, page, limit int) map[string]any {
	items, totalPages, total := s.buildMarketPage(strategy, region, "", page, limit)
	return map[string]any{
		"strategy":   strategy,
		"label":      strategyLabel(strategy),
		"narrative":  buildNarrative(strategy, firstRecord(items)),
		"matches":    items,
		"stocks":     items,
		"page":       page,
		"limit":      limit,
		"total":      total,
		"totalPages": totalPages,
	}
}

func (s *Service) Discover(q, kind, strategy, region string, page, limit int) map[string]any {
	items, totalPages, total := s.buildMarketPage(strategy, region, q, page, limit)
	lookupItems := []map[string]any{}
	for _, item := range items {
		lookupItems = append(lookupItems, map[string]any{
			"symbol":    stringAt(item, "symbol"),
			"name":      stringAt(item, "name"),
			"kind":      "stock",
			"query":     q,
			"exchange":  stringAt(item, "exchange"),
			"quoteType": "EQUITY",
			"sector":    stringAt(item, "sector"),
			"industry":  stringAt(item, "industry"),
			"currency":  stringAt(item, "currency"),
			"price":     item["price"],
			"changePct": item["changePct"],
			"marketCap": item["marketCap"],
			"source":    "finfeed",
		})
	}
	return map[string]any{
		"query":      q,
		"kind":       kind,
		"limit":      limit,
		"page":       page,
		"total":      total,
		"totalPages": totalPages,
		"count":      total,
		"sections":   []map[string]any{{"kind": "stock", "label": "Stocks", "count": len(lookupItems), "items": lookupItems}},
		"items":      lookupItems,
		"live":       items,
	}
}

func (s *Service) Quote(symbol string) (map[string]any, error) {
	return s.singleRecord(strings.ToUpper(strings.TrimSpace(symbol)))
}

func (s *Service) Detail(symbol, strategy string) (map[string]any, error) {
	record, err := s.singleRecord(strings.ToUpper(strings.TrimSpace(symbol)))
	if err != nil {
		return nil, err
	}
	candles, _ := s.client.GetCandles(strings.ToUpper(strings.TrimSpace(symbol)), 260)
	history := historyRecords(candles)
	technicals := buildTechnicals(candles)
	performance := buildPerformance(candles, technicals)
	score := numberAt(record, "strategyScores", strategy)
	sector := stringAt(record, "sector")
	industry := stringAt(record, "industry")
	peerRank := s.peerRank(symbol, sector, industry, strategy)
	outlook := map[string]any{
		"summary":        stringAt(record, "story"),
		"bull":           "Price and trend support remain intact if the symbol stays above its key moving support.",
		"bear":           "If momentum breaks and market pressure rises, the setup can cool quickly.",
		"industryLeader": peerRank["isNo1"],
	}
	verdict := map[string]any{
		"action":     verdictAction(score),
		"headline":   fmt.Sprintf("%s fit for %s", stringAt(record, "symbol"), strategyLabel(strategy)),
		"analyst":    "Alpha Wolf house read",
		"confidence": confidenceFromScore(score),
		"score":      int(math.Round(score)),
	}
	return map[string]any{
		"stock":           record,
		"history":         history,
		"technicals":      technicals,
		"news":            []map[string]any{},
		"business":        buildBusiness(record, performance),
		"performance":     performance,
		"peerRank":        peerRank,
		"verdict":         verdict,
		"outlook":         outlook,
		"financials":      map[string]any{},
		"sectorInsight":   s.sectorInsight(sector),
		"industryInsight": s.industryInsight(industry),
		"strategy":        strategy,
	}, nil
}

func (s *Service) Financials(symbol string) map[string]any {
	return map[string]any{
		"incomeStatement":          map[string]any{},
		"quarterlyIncomeStatement": map[string]any{},
		"balanceSheet":             map[string]any{},
		"quarterlyBalanceSheet":    map[string]any{},
		"cashFlow":                 map[string]any{},
		"quarterlyCashFlow":        map[string]any{},
		"earnings":                 []map[string]any{},
		"calendar":                 map[string]any{},
		"secFilings":               []map[string]any{},
	}
}

func (s *Service) MarketSnapshot(market string) map[string]any {
	region := "us"
	if strings.Contains(strings.ToUpper(market), "TH") || strings.Contains(strings.ToUpper(market), "SET") {
		region = "th"
	}
	items, _, _ := s.buildMarketPage("momentum", region, "", 1, 8)
	advancers := 0
	for _, item := range items {
		if numberAt(item, "changePct") >= 0 {
			advancers++
		}
	}
	return map[string]any{
		"market": strings.ToUpper(market),
		"status": map[string]any{"state": "live", "source": "finfeed"},
		"summary": map[string]any{
			"advancers": advancers,
			"decliners": maxInt(len(items)-advancers, 0),
			"leaders":   items,
		},
	}
}

func (s *Service) Calendar(month, region string) types.MarketCalendarResponse {
	if month == "" {
		month = time.Now().Format("2006-01")
	}
	response := types.MarketCalendarResponse{Month: month, Region: region, Events: []types.MarketCalendarEvent{}}
	holdings, _ := s.portfolio.ListHoldings()
	holdingSet := map[string]bool{}
	for _, holding := range holdings {
		holdingSet[holding.Symbol] = true
	}
	orders, _ := s.portfolio.ListOrders()
	for _, order := range orders {
		if !strings.HasPrefix(order.ScheduledFor, month) {
			continue
		}
		note := "Scheduled buy"
		response.Events = append(response.Events, types.MarketCalendarEvent{
			Date:        order.ScheduledFor,
			Symbol:      order.Symbol,
			Name:        order.Symbol,
			Kind:        "payment",
			Region:      inferRegion(order.Symbol),
			MarketLabel: marketLabel(order.Symbol),
			IsHolding:   holdingSet[order.Symbol],
			Note:        &note,
		})
	}
	sort.Slice(response.Events, func(i, j int) bool { return response.Events[i].Date < response.Events[j].Date })
	response.Summary.TotalEvents = len(response.Events)
	for _, event := range response.Events {
		if event.IsHolding {
			response.Summary.HoldingEvents++
		}
		if event.Region == "th" {
			response.Summary.ThEvents++
		} else {
			response.Summary.UsEvents++
		}
	}
	return response
}

func (s *Service) Portfolio() (types.PortfolioDashboard, error) {
	holdings, err := s.portfolio.ListHoldings()
	if err != nil {
		return types.PortfolioDashboard{}, err
	}
	orders, err := s.portfolio.ListOrders()
	if err != nil {
		return types.PortfolioDashboard{}, err
	}
	dashboard := types.PortfolioDashboard{
		DcaOrders:    orders,
		Holdings:     []map[string]any{},
		Chart:        []types.PortfolioPoint{},
		Markers:      []types.PortfolioMarker{},
		IncomeEvents: []types.IncomeEvent{},
	}
	if len(holdings) == 0 {
		for _, order := range orders {
			dashboard.Markers = append(dashboard.Markers, types.PortfolioMarker{Date: order.ScheduledFor, Symbol: order.Symbol, Amount: order.Amount})
		}
		return dashboard, nil
	}

	totalValue := 0.0
	invested := 0.0
	chartMap := map[string]types.PortfolioPoint{}
	for _, holding := range holdings {
		record, err := s.singleRecord(holding.Symbol)
		if err != nil {
			continue
		}
		price := numberAt(record, "price")
		value := holding.Shares * price
		cost := holding.Shares * holding.AverageCost
		totalValue += value
		invested += cost
		row := cloneMap(record)
		row["id"] = holding.ID
		row["shares"] = holding.Shares
		row["averageCost"] = holding.AverageCost
		row["strategy"] = holding.Strategy
		row["monthlyDca"] = holding.MonthlyDca
		row["createdAt"] = holding.CreatedAt
		row["value"] = round2(value)
		row["cost"] = round2(cost)
		row["gainLoss"] = round2(value - cost)
		row["gainLossPct"] = round2(pct(value, cost))
		dashboard.Holdings = append(dashboard.Holdings, row)
		dashboard.Markers = append(dashboard.Markers, types.PortfolioMarker{Date: isoDate(holding.CreatedAt), Symbol: holding.Symbol, Amount: round2(cost)})

		candles, _ := s.client.GetCandles(holding.Symbol, 90)
		for _, candle := range candles {
			point := chartMap[candle.Date]
			point.Date = candle.Date
			point.Value += candle.Close * holding.Shares
			point.Cost += cost
			chartMap[candle.Date] = point
		}
	}
	for _, order := range orders {
		dashboard.Markers = append(dashboard.Markers, types.PortfolioMarker{Date: order.ScheduledFor, Symbol: order.Symbol, Amount: order.Amount})
	}
	dates := make([]string, 0, len(chartMap))
	for key := range chartMap {
		dates = append(dates, key)
	}
	sort.Strings(dates)
	for _, key := range dates {
		point := chartMap[key]
		point.Value = round2(point.Value)
		point.Cost = round2(point.Cost)
		dashboard.Chart = append(dashboard.Chart, point)
	}
	gainLoss := totalValue - invested
	dashboard.Summary = types.PortfolioSummary{
		TotalValue:   round2(totalValue),
		Invested:     round2(invested),
		GainLoss:     round2(gainLoss),
		GainLossPct:  round2(pct(totalValue, invested)),
		DividendsYTD: 0,
		ForwardYield: 0,
	}
	return dashboard, nil
}

func (s *Service) SaveHolding(input types.HoldingInput) (types.Holding, error) {
	return s.portfolio.UpsertHolding(input)
}

func (s *Service) DeleteHolding(symbol string) error {
	return s.portfolio.DeleteHolding(symbol)
}

func (s *Service) SaveOrder(input types.DcaOrderInput) (types.DcaOrder, error) {
	if input.Status == "" {
		input.Status = "planned"
	}
	return s.portfolio.CreateOrder(input)
}

func (s *Service) UpdateOrderAmount(orderID int, amount float64) (types.DcaOrder, error) {
	return s.portfolio.UpdateOrderAmount(orderID, amount)
}

func (s *Service) DeleteOrder(orderID int) error {
	return s.portfolio.DeleteOrder(orderID)
}

func (s *Service) MarketComparison(symbol string) (map[string]any, error) {
	record, err := s.singleRecord(symbol)
	if err != nil {
		return nil, err
	}
	region := inferRegion(symbol)
	items, _, _ := s.buildMarketPage("momentum", region, "", 1, 6)
	peer := firstDifferent(items, symbol, stringAt(record, "sector"))
	benchmark := firstDifferent(items, symbol, "")
	stockCandles, _ := s.client.GetCandles(symbol, 120)
	peerCandles, _ := s.client.GetCandles(stringAt(peer, "symbol"), 120)
	benchmarkCandles, _ := s.client.GetCandles(stringAt(benchmark, "symbol"), 120)
	return map[string]any{
		"stock":     map[string]any{"symbol": stringAt(record, "symbol"), "name": stringAt(record, "name"), "returnPct": trailingReturn(stockCandles)},
		"benchmark": map[string]any{"symbol": stringAt(benchmark, "symbol"), "name": stringAt(benchmark, "name"), "returnPct": trailingReturn(benchmarkCandles)},
		"peer":      map[string]any{"symbol": stringAt(peer, "symbol"), "name": stringAt(peer, "name"), "returnPct": trailingReturn(peerCandles)},
		"points":    alignComparison(stockCandles, benchmarkCandles, peerCandles),
	}, nil
}

func (s *Service) SectorInsight(key string) map[string]any {
	return s.sectorInsight(key)
}

func (s *Service) IndustryInsight(key string) map[string]any {
	return s.industryInsight(key)
}

func (s *Service) sectorInsight(key string) map[string]any {
	records, _, _, _ := s.catalog()
	companies := []map[string]any{}
	for _, record := range records {
		if strings.EqualFold(record.Sector, key) {
			companies = append(companies, map[string]any{"symbol": record.Symbol, "name": record.Name, "region": record.Region})
		}
	}
	return map[string]any{"key": key, "industries": companies, "topEtfs": []map[string]any{}, "topMutualFunds": []map[string]any{}}
}

func (s *Service) industryInsight(key string) map[string]any {
	records, _, _, _ := s.catalog()
	companies := []map[string]any{}
	for _, record := range records {
		if strings.EqualFold(record.Industry, key) {
			companies = append(companies, map[string]any{"symbol": record.Symbol, "name": record.Name, "region": record.Region})
		}
	}
	return map[string]any{"key": key, "sectorKey": nil, "sectorName": nil, "topPerformingCompanies": companies, "topGrowthCompanies": companies}
}

func (s *Service) buildMarketPage(strategy, region, query string, page, limit int) ([]map[string]any, int, int) {
	records, _, _, _ := s.catalog()
	filtered := []catalogRecord{}
	term := strings.ToLower(strings.TrimSpace(query))
	for _, record := range records {
		if region != "" && region != "all" && record.Region != region {
			continue
		}
		if term != "" && !strings.Contains(strings.ToLower(record.Symbol), term) && !strings.Contains(strings.ToLower(record.Name), term) {
			continue
		}
		filtered = append(filtered, record)
	}
	total := len(filtered)
	if total == 0 {
		return []map[string]any{}, 1, 0
	}
	totalPages := int(math.Ceil(float64(total) / float64(maxInt(limit, 1))))
	if page < 1 {
		page = 1
	}
	if page > totalPages {
		page = totalPages
	}
	start := (page - 1) * limit
	end := minInt(start+limit, len(filtered))
	pageRecords := filtered[start:end]

	items := []map[string]any{}
	for _, record := range pageRecords {
		row, err := s.singleRecord(record.Symbol)
		if err == nil {
			items = append(items, row)
		}
	}
	sort.SliceStable(items, func(i, j int) bool {
		return numberAt(items[i], "strategyScores", strategy) > numberAt(items[j], "strategyScores", strategy)
	})
	return items, totalPages, total
}

func (s *Service) singleRecord(symbol string) (map[string]any, error) {
	cacheKey := "record:" + symbol
	if cached, ok := s.cache.Get(cacheKey); ok {
		if value, cast := cached.(map[string]any); cast {
			return value, nil
		}
	}

	metadata, ok := s.findCatalogRecord(symbol)
	if !ok {
		metadata = catalogRecord{Symbol: symbol, Name: symbol, Currency: currencyForSymbol(symbol), Region: inferRegion(symbol), Sector: "Unknown", Industry: "Unknown"}
	}
	price, err := s.client.GetPrice(symbol)
	if err != nil {
		return nil, err
	}
	candles, _ := s.client.GetCandles(symbol, 130)
	changePct := price.ChangePercent
	if changePct == 0 && len(candles) >= 2 {
		changePct = pct(price.Price, candles[len(candles)-2].Close)
	}
	weeklyTrend := trailingReturnDays(candles, 5)
	monthlyTrend := trailingReturnDays(candles, 21)
	quarterTrend := trailingReturnDays(candles, 63)
	strategyScores := scoreStrategies(price.Price, changePct, weeklyTrend, monthlyTrend, quarterTrend, metadata)
	bestStrategy, bestScore := bestStrategy(strategyScores)
	record := map[string]any{
		"symbol":         symbol,
		"name":           choose(price.Name, metadata.Name, symbol),
		"sector":         metadata.Sector,
		"industry":       metadata.Industry,
		"sectorKey":      metadata.Sector,
		"industryKey":    metadata.Industry,
		"exchange":       choose(metadata.Exchange, regionExchange(metadata.Region), ""),
		"market":         choose(metadata.Exchange, regionExchange(metadata.Region), ""),
		"currency":       choose(price.Currency, metadata.Currency, currencyForSymbol(symbol)),
		"marketCap":      nil,
		"indexes":        []string{"stock", metadata.Region},
		"price":          round2(price.Price),
		"changePct":      round2(changePct),
		"weeklyTrend":    round2(weeklyTrend),
		"sparkline":      sparkline(candles),
		"recommendation": recommendationFromBestStrategy(bestStrategy, bestScore),
		"story":          storyFromStrategy(bestStrategy, bestScore, monthlyTrend, weeklyTrend),
		"strategyScores": strategyScores,
		"dividendYield":  nil,
		"exDividendDate": nil,
		"updatedAt":      time.Now().UTC().Format(time.RFC3339),
	}
	s.cache.Set(cacheKey, record, 3*time.Minute)
	return record, nil
}

func (s *Service) catalog() ([]catalogRecord, string, string, error) {
	if cached, ok := s.cache.Get("catalog"); ok {
		if value, cast := cached.([]catalogRecord); cast {
			if fetched, ok1 := s.cache.Get("catalog:fetched"); ok1 {
				if expires, ok2 := s.cache.Get("catalog:expires"); ok2 {
					return value, fetched.(string), expires.(string), nil
				}
			}
		}
	}
	regions := map[string][]string{
		"us": s.resolveExchangeIDs("US", s.cfg.UsExchangeIDs),
		"th": s.resolveExchangeIDs("TH", s.cfg.ThExchangeIDs),
	}
	records := []catalogRecord{}
	seen := map[string]bool{}
	for region, exchangeIDs := range regions {
		for _, exchangeID := range exchangeIDs {
			stocks, err := s.client.ListStocksByExchange(exchangeID, 0)
			if err != nil {
				continue
			}
			for _, stock := range stocks {
				symbol := strings.ToUpper(strings.TrimSpace(stock.Symbol))
				if symbol == "" || seen[symbol] || strings.HasSuffix(symbol, "-R.BK") {
					continue
				}
				seen[symbol] = true
				records = append(records, catalogRecord{
					Symbol:   symbol,
					Name:     choose(stock.Name, symbol, ""),
					Currency: choose(stock.Currency, currencyForSymbol(symbol), ""),
					Exchange: choose(stock.ExchangeCode, regionExchange(region), ""),
					Region:   region,
					Sector:   inferSector(symbol, choose(stock.Name, symbol, "")),
					Industry: inferIndustry(symbol, choose(stock.Name, symbol, "")),
				})
			}
		}
	}
	sort.Slice(records, func(i, j int) bool { return records[i].Symbol < records[j].Symbol })
	now := time.Now().UTC()
	s.cache.Set("catalog", records, 24*time.Hour)
	s.cache.Set("catalog:fetched", now.Format(time.RFC3339), 24*time.Hour)
	s.cache.Set("catalog:expires", now.Add(24*time.Hour).Format(time.RFC3339), 24*time.Hour)
	return records, now.Format(time.RFC3339), now.Add(24 * time.Hour).Format(time.RFC3339), nil
}

func (s *Service) resolveExchangeIDs(countryCode string, configured string) []string {
	if strings.TrimSpace(configured) != "" {
		parts := strings.Split(configured, ",")
		values := []string{}
		for _, part := range parts {
			part = strings.TrimSpace(part)
			if part != "" {
				values = append(values, part)
			}
		}
		if len(values) > 0 {
			return values
		}
	}
	exchanges, err := s.client.ListExchanges()
	if err != nil {
		return []string{}
	}
	values := []string{}
	for _, exchange := range exchanges {
		if strings.EqualFold(exchange.CountryCode, countryCode) || strings.EqualFold(exchange.Country, countryCode) {
			values = append(values, exchange.ID)
		}
	}
	return values
}

func (s *Service) findCatalogRecord(symbol string) (catalogRecord, bool) {
	records, _, _, _ := s.catalog()
	for _, record := range records {
		if record.Symbol == symbol {
			return record, true
		}
	}
	return catalogRecord{}, false
}

func (s *Service) peerRank(symbol, sector, industry, strategy string) map[string]any {
	records, _, _, _ := s.catalog()
	candidates := []catalogRecord{}
	for _, record := range records {
		if strings.EqualFold(record.Industry, industry) || strings.EqualFold(record.Sector, sector) {
			candidates = append(candidates, record)
		}
	}
	if len(candidates) == 0 {
		return map[string]any{"sector": sector, "industry": industry, "count": 0, "rank": 1, "isNo1": true, "leader": symbol, "leaderScore": 0}
	}
	type scored struct {
		Symbol string
		Score  float64
	}
	scoredItems := []scored{}
	for _, candidate := range candidates {
		record, err := s.singleRecord(candidate.Symbol)
		if err != nil {
			continue
		}
		scoredItems = append(scoredItems, scored{Symbol: candidate.Symbol, Score: numberAt(record, "strategyScores", strategy)})
	}
	sort.Slice(scoredItems, func(i, j int) bool { return scoredItems[i].Score > scoredItems[j].Score })
	rank := 1
	leader := symbol
	leaderScore := 0.0
	if len(scoredItems) > 0 {
		leader = scoredItems[0].Symbol
		leaderScore = scoredItems[0].Score
	}
	for index, item := range scoredItems {
		if item.Symbol == symbol {
			rank = index + 1
			break
		}
	}
	return map[string]any{"sector": sector, "industry": industry, "count": len(scoredItems), "rank": rank, "isNo1": rank == 1, "leader": leader, "leaderScore": int(math.Round(leaderScore))}
}
