package finfeed

type Exchange struct {
	ID          string `json:"id"`
	Code        string `json:"code"`
	Name        string `json:"name"`
	Country     string `json:"country"`
	CountryCode string `json:"countryCode"`
	Region      string `json:"region"`
}

type Stock struct {
	Symbol       string `json:"symbol"`
	Name         string `json:"name"`
	ExchangeID   string `json:"exchangeId"`
	ExchangeCode string `json:"exchangeCode"`
	Market       string `json:"market"`
	Currency     string `json:"currency"`
}

type Price struct {
	Symbol        string  `json:"symbol"`
	Name          string  `json:"name"`
	Currency      string  `json:"currency"`
	Price         float64 `json:"price"`
	Change        float64 `json:"change"`
	ChangePercent float64 `json:"changePercent"`
	Timestamp     string  `json:"timestamp"`
}

type Candle struct {
	Date   string  `json:"date"`
	Open   float64 `json:"open"`
	High   float64 `json:"high"`
	Low    float64 `json:"low"`
	Close  float64 `json:"close"`
	Volume float64 `json:"volume"`
}
