from __future__ import annotations

from typing import Any

from internal.market.scoring import StrategyKey, clamp, inverse_score, normalized_score

STRATEGY_CONFIGS = {
    "momentum": {
        "weight_value": 0.05,
        "weight_health": 0.15,
        "weight_growth": 0.20,
        "weight_smart_money": 0.10, # Follow the big institutional waves
        "weight_dividend": 0.00,
        "weight_timing": 0.50,
        "rsi_mode": "momentum"
    },
    "dividend_yield": {
        "weight_value": 0.20,
        "weight_health": 0.30,      # High health weight to ensure dividend isn't cut
        "weight_growth": 0.00,
        "weight_smart_money": 0.10,
        "weight_dividend": 0.30,
        "weight_timing": 0.10,
        "rsi_mode": "mean_reversion"
    },
    "capitalization": {
        "weight_value": 0.20,
        "weight_health": 0.30,
        "weight_growth": 0.20,
        "weight_smart_money": 0.20, # Institutions love scale and safety
        "weight_dividend": 0.00,
        "weight_timing": 0.10,
        "rsi_mode": "neutral"
    }
}


def format_optional(value: Any) -> str:
    from internal.store.utils import as_float

    number = as_float(value)
    if number is None:
        return "n/a"
    if abs(number) >= 100:
        return f"{number:,.0f}"
    return f"{number:.2f}"

def evaluate_balance_sheet(debt_to_equity: float, current_ratio: float) -> int:
    """Evaluates survival risk based on liquidity and solvency."""
    score = 50
    # Current Ratio (Liquidity): Can they pay short term bills? (> 1.2 is safe, < 1.0 is risky)
    if current_ratio is not None:
        if current_ratio >= 1.5: score += 25
        elif current_ratio < 1.0: score -= 25
        
    # Debt to Equity (Solvency): Are they over-leveraged? (< 50 is great, > 150 is dangerous)
    if debt_to_equity is not None:
        if debt_to_equity < 50: score += 25
        elif debt_to_equity > 150: score -= 30
        
    return int(clamp(score))

def evaluate_relative_value(pe: float, industry_pe: float) -> int:
    """Contextual valuation: Is it cheap compared to its specific peers?"""
    if not pe or not industry_pe: return 50
    
    # Calculate premium/discount to industry
    ratio = pe / industry_pe
    
    if ratio < 0.7: return 90    # 30% discount to peers
    if ratio <= 1.0: return 70   # Fair value to slight discount
    if ratio < 1.3: return 40    # Slight premium
    return 10

def analyze_with_heuristics(bundle: Dict[str, Any], strategy: str) -> Dict[str, Any]:
    stock = bundle["stock"]
    technicals = bundle["technicals"]
    business = bundle.get("business", {})
    
    config = STRATEGY_CONFIGS.get(strategy, STRATEGY_CONFIGS["momentum"])

    # 1. DEEP FUNDAMENTALS
    value_score = evaluate_relative_value(business.get("peRatio"), business.get("industryPe"))
    
    health_score = evaluate_balance_sheet(business.get("debtToEquity"), business.get("currentRatio"))
    
    growth_score = int(round(clamp(normalized_score(business.get("revenueGrowth"), 0.0, 30.0))))
    
    # Institutional Ownership (> 70% shows strong smart money conviction)
    smart_money_score = int(round(clamp(normalized_score(business.get("institutionalOwnership"), 20.0, 90.0))))
    
    dividend_score = 50
    if business.get("dividendYield"):
        dividend_score = int(round(clamp(
            50 + (business.get("dividendYield") * 6) - (max(business.get("payoutRatio") - 75, 0))
        )))

    # 2. TECHNICAL TIMING
    rsi = technicals.get("rsi14", 50.0)
    if config["rsi_mode"] == "momentum":
        rsi_component = normalized_score(rsi, 30.0, 70.0)
    elif config["rsi_mode"] == "mean_reversion":
        rsi_component = inverse_score(rsi, 30.0, 70.0)
    else:
        rsi_component = 100 - (abs(rsi - 50.0) * 2)

    timing_score = int(round(clamp(
        0.30 * rsi_component
        + 0.30 * normalized_score(technicals.get("trend", {}).get("month"), -12.0, 20.0)
        + 0.20 * normalized_score(technicals.get("macdHistogram"), -1.5, 1.5)
        + 0.20 * normalized_score(technicals.get("volumeRatio"), 0.5, 2.0)
    )))

    # 3. THE UNIFIED CONTEXT SCORE
    overall = int(round(clamp(
        config["weight_value"] * value_score
        + config["weight_health"] * health_score
        + config["weight_growth"] * growth_score
        + config["weight_smart_money"] * smart_money_score
        + config["weight_dividend"] * dividend_score
        + config["weight_timing"] * timing_score
    )))

    tone = "good" if overall >= 75 else "warn" if overall >= 55 else "bad"
    signal = {"good": "STRONG CONVICTION", "warn": "WATCH / HOLD", "bad": "HIGH RISK / AVOID"}[tone]
    return {
        "signal": signal,
        "headline": local_headline(stock, tone),
        "tone": tone,
        "confidence": overall,
        "summary": local_summary(stock, technicals, overall),
        "scores": [
            {"label": "Value", "score": value_score, "why": f"P/E of {format_optional(business.get('peRatio'))} vs. typical range."},
            {"label": "Financial health", "score": profitability_score, "why": f"Profit margin of {format_optional(business.get('profitMargin'))}%."},
            {"label": "Dividend safety", "score": dividend_score, "why": f"{format_optional(business.get('dividendYield'))}% yield, payout {format_optional(business.get('payoutRatio'))}%."},
            {"label": "Growth", "score": growth_score, "why": f"Revenue growth of {format_optional(business.get('revenueGrowth'))}%."},
            {"label": "Timing", "score": timing_score, "why": local_dca_timing(dividend_pattern, short=True)},
        ],
        "bullets": [local_dca_timing(dividend_pattern), *local_news_notes(bundle["news"])[:2]],
        "dcaTiming": local_dca_timing(dividend_pattern),
    }

def normalize_analysis(parsed: dict[str, Any], bundle: dict[str, Any], strategy: StrategyKey, *, raw_text: str) -> dict[str, Any]:
    fallback = analyze_with_heuristics(bundle, strategy)

    tone = str(parsed.get("tone") or fallback["tone"])
    if tone not in ("good", "warn", "bad"):
        tone = fallback["tone"]

    scores = parsed.get("scores")
    if not isinstance(scores, list) or not scores:
        scores = fallback["scores"]
    else:
        scores = [
            {
                "label": str(item.get("label") or ""),
                "score": int(clamp(float(item.get("score") or 0))),
                "why": str(item.get("why") or ""),
            }
            for item in scores[:5]
            if isinstance(item, dict)
        ] or fallback["scores"]

    bullets = parsed.get("bullets")
    if not isinstance(bullets, list) or not bullets:
        bullets = fallback["bullets"]
    else:
        bullets = [str(item) for item in bullets[:4]]

    return {
        "signal": str(parsed.get("signal") or fallback["signal"]),
        "headline": str(parsed.get("headline") or fallback["headline"]),
        "tone": tone,
        "confidence": int(clamp(float(parsed.get("confidence") or fallback["confidence"]))),
        "summary": str(parsed.get("summary") or fallback["summary"]),
        "scores": scores,
        "bullets": bullets,
        "dcaTiming": str(parsed.get("dcaTiming") or fallback["dcaTiming"]),
        "raw": raw_text,
    }


def local_dca_timing(dividend_pattern: dict[str, Any] | None, *, short: bool = False) -> str:
    if not dividend_pattern or not dividend_pattern.get("sampleSize"):
        return "No dividend history to time off" if short else "No dividend history is available to time the buy, so a flat monthly DCA is the simplest approach."
    if dividend_pattern.get("hasPattern"):
        if short:
            return f"Dips {abs(dividend_pattern['averageDipPct']):.1f}% post ex-div, {dividend_pattern['hitRate']:.0f}% of the time."
        return (
            f"Across {dividend_pattern['sampleSize']} past payouts the price dipped {abs(dividend_pattern['averageDipPct']):.1f}% on average "
            f"in the 10 days after the ex-dividend date ({dividend_pattern['hitRate']:.0f}% of the time) — placing the buy a few days after "
            "the next ex-dividend date has tended to get a better entry than a fixed date."
        )
    return "No reliable post-dividend dip" if short else "This stock doesn't show a reliable post-dividend dip, so a flat scheduled DCA (or timing off technicals instead) makes more sense."


def local_headline(stock: dict[str, Any], tone: str) -> str:
    symbol = stock["symbol"]
    if tone == "good":
        return f"Looks like a fit for your plan — {symbol} clears the bar on value and timing."
    if tone == "warn":
        return f"{symbol} is on the radar, but not urgent yet."
    return f"Better to wait on {symbol} this month."


def local_summary(stock: dict[str, Any], technicals: dict[str, Any], score: int) -> str:
    return (
        f"{stock['symbol']} is trading with a {score}/100 strategy fit. "
        f"RSI sits near {format_optional(technicals.get('rsi14'))}, MACD is {format_optional(technicals.get('macdHistogram'))}, "
        f"and the live news flow is being used to refine the read."
    )


def local_news_notes(news: list[dict[str, Any]]) -> list[str]:
    notes = [str(item["title"]) for item in news[:4] if item.get("title")]
    return notes or ["No recent news items were returned by the live feed."]
