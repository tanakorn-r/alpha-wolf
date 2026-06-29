package analysis

import (
	"fmt"
	"strings"

	"alpha-wolf/apps/go-api/internal/config"
	"alpha-wolf/apps/go-api/internal/openai"
)

type Service struct {
	client *openai.Client
}

func NewService(cfg config.Config) *Service {
	return &Service{client: openai.NewClient(cfg)}
}

func (s *Service) Summary(symbol, strategy string, detail map[string]any) (map[string]any, error) {
	instructions := `
You are Alpha Wolf's house equity analyst.
Return JSON only with keys:
signal, headline, tone, confidence, summary, targetPrice, entryPrice, scores, bullets, dcaTiming.
Rules:
- tone must be good, warn, or bad
- confidence must be 1-100
- targetPrice must contain currentPrice, targetPrice, impliedUpsidePct, timeHorizon, basis
- entryPrice must contain currentPrice, entryPrice, distanceFromCurrentPct, why
- scores must contain exactly 5 items in order: Value, Financial health, Dividend safety, Growth, Timing
- bullets must have 3 short bullets
- dcaTiming must be one short sentence
- use the supplied stock/business/performance/technicals context only
- be balanced across business, market, valuation, and timing
`
	return s.run(symbol, strategy, detail, instructions, 1800)
}

func (s *Service) Quant(symbol, strategy string, detail map[string]any) (map[string]any, error) {
	instructions := `
You are Alpha Wolf's quant perspective analyst.
Return JSON only with keys:
signal, tone, buyScore, investability, hook, nextActionWindow, buyPlan, summary, setup, trigger, risk, checks, tradingViewFocus.
Rules:
- tone must be good, warn, or bad
- investability must be FAVORABLE, WATCH, or AVOID
- buyScore must be 1-100 and actually vary
- hook must be a short punchy setup summary with current price and at least one concrete level or indicator
- buyPlan must be plain and specific for a user, not jargon-heavy
- checks must be 4-6 items with label, value, status, insight
- tradingViewFocus must be 3-5 exact next things to inspect
`
	return s.run(symbol, strategy, detail, instructions, 1800)
}

func (s *Service) Today(symbol, strategy string, detail map[string]any) (map[string]any, error) {
	instructions := `
You are Alpha Wolf's today-performance analyst.
Return JSON only with keys:
signal, tone, buyScore, headline, summary, sessionRead, whatChangedToday, keyLevel, action, risk.
Rules:
- tone must be good, warn, or bad
- buyScore must be 1-100
- headline and summary must be short and decisive
- focus on today's move in the context of the broader setup
`
	return s.run(symbol, strategy, detail, instructions, 1400)
}

func (s *Service) run(symbol, strategy string, detail map[string]any, instructions string, maxTokens int) (map[string]any, error) {
	if !s.client.Enabled() {
		return nil, fmt.Errorf("OPENAI_API_KEY is not configured")
	}
	context := map[string]any{
		"symbol":   strings.ToUpper(symbol),
		"strategy": strategy,
		"detail":   detail,
	}
	result, err := s.client.AnalyzeJSON(instructions, context, maxTokens)
	if err != nil {
		return nil, err
	}
	result["source"] = "openai"
	result["model"] = "gpt-5.4-mini"
	return result, nil
}
