from __future__ import annotations

from typing import Any

from internal.market.scoring import StrategyKey, clamp, confidence_from_score, normalized_score


def format_optional(value: Any) -> str:
    from internal.store.utils import as_float

    number = as_float(value)
    if number is None:
        return "n/a"
    if abs(number) >= 100:
        return f"{number:,.0f}"
    return f"{number:.2f}"


def analyze_with_heuristics(bundle: dict[str, Any], strategy: StrategyKey) -> dict[str, Any]:
    stock = bundle["stock"]
    technicals = bundle["technicals"]
    score = int(round(clamp(
        0.42 * float(stock.get("strategyScores", {}).get(strategy, 50))
        + 0.18 * normalized_score(technicals.get("rsi14"), 25.0, 75.0)
        + 0.14 * normalized_score(technicals.get("macdHistogram"), -1.5, 1.5)
        + 0.12 * normalized_score(technicals.get("volumeRatio"), 0.5, 2.0)
        + 0.14 * normalized_score(technicals.get("trend", {}).get("month"), -12.0, 20.0)
    )))

    return {
        "score": score,
        "recommendation": local_recommendation(stock, strategy, score),
        "summary": local_summary(stock, technicals, score),
        "reasons": local_reasons(technicals),
        "future": local_future(score),
        "confidence": confidence_from_score(score),
        "technicalNotes": local_technical_notes(technicals),
        "newsNotes": local_news_notes(bundle["news"]),
    }


def normalize_analysis(parsed: dict[str, Any], bundle: dict[str, Any], strategy: StrategyKey, *, raw_text: str) -> dict[str, Any]:
    from internal.store.utils import as_float

    stock = bundle["stock"]
    technicals = bundle["technicals"]
    score = int(clamp(as_float(parsed.get("score")) or 0))
    if score <= 0:
        score = int(round(float(stock.get("strategyScores", {}).get(strategy, 50))))

    reasons = parsed.get("reasons")
    if not isinstance(reasons, list):
        reasons = local_reasons(technicals)

    technical_notes = parsed.get("technicalNotes")
    if not isinstance(technical_notes, list):
        technical_notes = local_technical_notes(technicals)

    news_notes = parsed.get("newsNotes")
    if not isinstance(news_notes, list):
        news_notes = local_news_notes(bundle["news"])

    return {
        "score": score,
        "recommendation": str(parsed.get("recommendation") or local_recommendation(stock, strategy, score)),
        "summary": str(parsed.get("summary") or local_summary(stock, technicals, score)),
        "reasons": [str(item) for item in reasons[:5]],
        "future": str(parsed.get("future") or local_future(score)),
        "confidence": str(parsed.get("confidence") or confidence_from_score(score)),
        "technicalNotes": [str(item) for item in technical_notes[:6]],
        "newsNotes": [str(item) for item in news_notes[:6]],
        "raw": raw_text,
    }


def local_recommendation(stock: dict[str, Any], strategy: StrategyKey, score: int) -> str:
    symbol = stock["symbol"]
    label = {
        "yield": "Best for income",
        "momentum": "Best for trend",
        "stable_dca": "Best for recurring buys",
    }.get(strategy, "Best for compounding")
    return f"{label}: {symbol} looks like a {score}/100 fit."


def local_summary(stock: dict[str, Any], technicals: dict[str, Any], score: int) -> str:
    return (
        f"{stock['symbol']} is trading with a {score}/100 strategy fit. "
        f"RSI sits near {format_optional(technicals.get('rsi14'))}, MACD is {format_optional(technicals.get('macdHistogram'))}, "
        f"and the live news flow is being used to refine the read."
    )


def local_future(score: int) -> str:
    if score >= 80:
        return "If momentum and news stay supportive, continuation looks possible over the next few sessions."
    if score >= 60:
        return "The setup is mixed, so expect a choppy path unless the technicals improve."
    return "The current mix looks fragile, so downside risk is still meaningful if support breaks."


def local_reasons(technicals: dict[str, Any]) -> list[str]:
    return [
        f"RSI: {format_optional(technicals.get('rsi14'))}",
        f"MACD histogram: {format_optional(technicals.get('macdHistogram'))}",
        f"20-day moving average: {format_optional(technicals.get('sma20'))}",
        f"Volume ratio: {format_optional(technicals.get('volumeRatio'))}",
    ]


def local_technical_notes(technicals: dict[str, Any]) -> list[str]:
    return [
        f"Trend signal: {technicals.get('signal', 'neutral')}",
        f"Support: {format_optional(technicals.get('support'))}",
        f"Resistance: {format_optional(technicals.get('resistance'))}",
        f"Volatility: {format_optional(technicals.get('volatility'))}",
    ]


def local_news_notes(news: list[dict[str, Any]]) -> list[str]:
    notes = [str(item["title"]) for item in news[:4] if item.get("title")]
    return notes or ["No recent news items were returned by the live feed."]
