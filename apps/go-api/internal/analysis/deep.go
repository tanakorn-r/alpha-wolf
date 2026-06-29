// Package analysis turns raw FinFeed price/candle data into the swing-style
// "deep analysis" read shown in the Deep AI panel: a buy/wait signal plus
// entry, stop, target and risk/reward levels. It is deliberately rule-based
// (support/resistance off the trailing window) rather than ML/LLM-driven,
// since FinFeed only supplies market data, not commentary.
package analysis

import (
	"fmt"
	"time"

	"alpha-wolf/apps/go-api/internal/finfeed"
)

type ChartPoint struct {
	Date  string  `json:"date"`
	Close float64 `json:"close"`
}

type DeepAnalysis struct {
	Symbol        string       `json:"symbol"`
	Name          string       `json:"name"`
	Currency      string       `json:"currency"`
	Price         float64      `json:"price"`
	ChangePercent float64      `json:"changePercent"`
	Signal        string       `json:"signal"`
	Color         string       `json:"color"`
	Chart         []ChartPoint `json:"chart"`
	Entry         float64      `json:"entry"`
	Stop          float64      `json:"stop"`
	Target        float64      `json:"target"`
	RiskReward    float64      `json:"riskReward"`
	BuyZoneLow    float64      `json:"buyZoneLow"`
	BuyZoneHigh   float64      `json:"buyZoneHigh"`
	Action        string       `json:"action"`
	Bullets       []string     `json:"bullets"`
	When          string       `json:"when"`
	GeneratedAt   string       `json:"generatedAt"`
}

const (
	colorBuy  = "#3ecf8e"
	colorWait = "#f5c451"
	colorTrim = "#f2575c"
)

func Compute(price finfeed.Price, candles []finfeed.Candle) DeepAnalysis {
	now := time.Now().UTC().Format(time.RFC3339)

	if len(candles) < 2 || price.Price <= 0 {
		return DeepAnalysis{
			Symbol:        price.Symbol,
			Name:          price.Name,
			Currency:      price.Currency,
			Price:         price.Price,
			ChangePercent: price.ChangePercent,
			Signal:        "LIMITED DATA",
			Color:         colorWait,
			Chart:         chartFromCandles(candles),
			Action:        fmt.Sprintf("Not enough trading history came back for %s yet to size an entry, stop, and target — try again once more bars are available.", price.Symbol),
			Bullets:       []string{"FinFeed returned too few historical bars for a reliable read."},
			When:          "right now",
			GeneratedAt:   now,
		}
	}

	support, resistance := swingRange(candles)
	rangeSize := resistance - support
	if rangeSize <= 0 {
		rangeSize = support * 0.05
		if rangeSize <= 0 {
			rangeSize = 1
		}
	}

	position := clamp01((price.Price - support) / rangeSize)

	var entry float64
	var signal, color, when string
	switch {
	case position <= 0.35:
		entry = price.Price
		signal, color, when = "BUY ZONE", colorBuy, "this session"
	case position >= 0.75:
		entry = support + rangeSize*0.35
		signal, color, when = "WAIT / TRIM", colorTrim, "on a pullback"
	default:
		entry = support + rangeSize*0.35
		signal, color, when = "WATCH", colorWait, "on a dip toward support"
	}

	stop := support - rangeSize*0.08
	target := resistance + rangeSize*0.15
	riskReward := 0.0
	if risk := entry - stop; risk > 0 {
		riskReward = (target - entry) / risk
	}

	return DeepAnalysis{
		Symbol:        price.Symbol,
		Name:          price.Name,
		Currency:      price.Currency,
		Price:         price.Price,
		ChangePercent: price.ChangePercent,
		Signal:        signal,
		Color:         color,
		Chart:         chartFromCandles(candles),
		Entry:         round2(entry),
		Stop:          round2(stop),
		Target:        round2(target),
		RiskReward:    round2(riskReward),
		BuyZoneLow:    round2(support),
		BuyZoneHigh:   round2(support + rangeSize*0.4),
		Action:        action(price, signal, entry, stop, target),
		Bullets:       bullets(price, support, resistance, entry, stop, target, riskReward),
		When:          when,
		GeneratedAt:   now,
	}
}

func swingRange(candles []finfeed.Candle) (support float64, resistance float64) {
	support, resistance = candles[0].Low, candles[0].High
	for _, candle := range candles {
		if candle.Low > 0 && candle.Low < support {
			support = candle.Low
		}
		if candle.High > resistance {
			resistance = candle.High
		}
	}
	return support, resistance
}

func chartFromCandles(candles []finfeed.Candle) []ChartPoint {
	points := make([]ChartPoint, 0, len(candles))
	for _, candle := range candles {
		if candle.Close <= 0 {
			continue
		}
		points = append(points, ChartPoint{Date: candle.Date, Close: round2(candle.Close)})
	}
	return points
}

func action(price finfeed.Price, signal string, entry, stop, target float64) string {
	switch signal {
	case "BUY ZONE":
		return fmt.Sprintf("%s is trading inside its own buy zone right now. A limit near %.2f with a stop at %.2f targets %.2f.", price.Symbol, entry, stop, target)
	case "WAIT / TRIM":
		return fmt.Sprintf("%s is stretched toward the top of its 30-day range — better to wait for a pullback near %.2f than chase it here.", price.Symbol, entry)
	default:
		return fmt.Sprintf("%s is mid-range. Set a limit near %.2f and let the stop at %.2f and target %.2f do the rest.", price.Symbol, entry, stop, target)
	}
}

func bullets(price finfeed.Price, support, resistance, entry, stop, target, riskReward float64) []string {
	return []string{
		fmt.Sprintf("30-day range: support %.2f, resistance %.2f.", support, resistance),
		fmt.Sprintf("Stop at %.2f caps downside to roughly %.1f%% from the entry.", stop, pctDrop(entry, stop)),
		fmt.Sprintf("Target %.2f implies %.1f%% upside, a risk/reward of %.1f.", target, pctGain(entry, target), riskReward),
	}
}

func pctDrop(entry, stop float64) float64 {
	if entry <= 0 {
		return 0
	}
	return (entry - stop) / entry * 100
}

func pctGain(entry, target float64) float64 {
	if entry <= 0 {
		return 0
	}
	return (target - entry) / entry * 100
}

func clamp01(value float64) float64 {
	if value < 0 {
		return 0
	}
	if value > 1 {
		return 1
	}
	return value
}

func round2(value float64) float64 {
	return float64(int(value*100+0.5)) / 100
}
