from __future__ import annotations

import math
from typing import Literal

from models import UniverseEntry

StrategyKey = Literal["capitalized", "stable_dca", "yield", "momentum"]

STRATEGY_LABELS: dict[StrategyKey, str] = {
    "capitalized": "Capitalized",
    "stable_dca": "Stable DCA",
    "yield": "Yield",
    "momentum": "Momentum",
}

STRATEGY_NARRATIVES: dict[StrategyKey, dict[str, str]] = {
    "capitalized": {
        "title": "Built for compounders",
        "summary": "Focus on durable businesses with scale, margin power, and room to keep compounding.",
        "positive": "Upside can be powerful when earnings quality and reinvestment stay intact.",
        "negative": "High expectations can compress valuation quickly if growth cools.",
        "recommendation": "Prioritize the strongest large-cap compounders in the live universe.",
    },
    "stable_dca": {
        "title": "Best for recurring buys",
        "summary": "Prefer calmer names that make regular accumulation easier to live with.",
        "positive": "Lower volatility can make it easier to keep buying through rough patches.",
        "negative": "The trade-off is usually slower upside versus the fastest growers.",
        "recommendation": "Lean toward steadier names with profitable cash generation and calmer swings.",
    },
    "yield": {
        "title": "Income-first",
        "summary": "Optimize for cash return and balance sheet resilience rather than just speed.",
        "positive": "Good income profiles can make holding through volatility feel much better.",
        "negative": "High yield is only attractive if the business can keep supporting it.",
        "recommendation": "Favor strong dividend payers with clean payout support and steady cash flow.",
    },
    "momentum": {
        "title": "Trend chaser",
        "summary": "Look for the names with the clearest trend and strongest recent price action.",
        "positive": "Momentum can deliver sharp upside when the trend keeps pressing higher.",
        "negative": "It can also reverse fast when the tape loses conviction.",
        "recommendation": "Favor the strongest recent relative-strength leaders on the board.",
    },
}


def parse_strategy(value: object) -> StrategyKey:
    if value in {"capitalized", "stable_dca", "yield", "momentum"}:
        return value  # type: ignore[return-value]
    return "capitalized"


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def normalized_score(value: float | None, low: float, high: float) -> float:
    if value is None:
        return 50.0
    if high <= low:
        return 50.0
    return clamp((value - low) / (high - low) * 100.0)


def inverse_score(value: float | None, low: float, high: float) -> float:
    if value is None:
        return 50.0
    if high <= low:
        return 50.0
    return clamp(100.0 - ((value - low) / (high - low) * 100.0))


def log_scale(value: float | None, low_log: float, high_log: float) -> float:
    if value is None or value <= 0:
        return 40.0
    if high_log <= low_log:
        return 50.0
    scale = (math.log10(value) - low_log) / (high_log - low_log) * 100.0
    return clamp(scale)


def weighted_score(parts: tuple[float, ...], bonus: float = 0.0) -> float:
    return clamp(sum(parts) + bonus)


def score_strategies(
    entry: UniverseEntry,
    *,
    market_cap: float | None,
    revenue_growth: float | None,
    operating_margins: float | None,
    gross_margins: float | None,
    free_cashflow: float | None,
    debt_to_equity: float | None,
    dividend_yield: float | None,
    payout_ratio: float | None,
    beta: float | None,
    volatility: float,
    weekly_trend: float,
    monthly_trend: float,
    quarterly_trend: float,
    relative_position: float | None,
    volume_ratio: float | None,
) -> dict[StrategyKey, float]:
    defensive_bonus = 10 if "defensive" in entry.indexes or "dividend" in entry.indexes else 0
    growth_bonus = 8 if "growth" in entry.indexes else 0
    etf_bonus = 4 if "etf" in entry.indexes else 0

    capitalized = weighted_score(
        (
            0.23 * log_scale(market_cap, 10.0, 12.5),
            0.18 * normalized_score(revenue_growth, -10.0, 30.0),
            0.18 * normalized_score(operating_margins, 0.0, 35.0),
            0.12 * normalized_score(gross_margins, 20.0, 80.0),
            0.12 * normalized_score(free_cashflow, 0.0, 40_000_000_000.0),
            0.09 * inverse_score(debt_to_equity, 40.0, 220.0),
            0.08 * normalized_score(relative_position, 0.0, 1.0),
        )
    )

    stable_dca = weighted_score(
        (
            0.24 * inverse_score(volatility, 0.7, 4.0),
            0.18 * inverse_score(beta, 0.7, 1.6),
            0.17 * normalized_score(free_cashflow, 0.0, 40_000_000_000.0),
            0.16 * normalized_score(operating_margins, 0.0, 35.0),
            0.13 * normalized_score(dividend_yield, 0.0, 8.0),
            0.08 * inverse_score(debt_to_equity, 40.0, 220.0),
            0.04 * normalized_score(relative_position, 0.0, 1.0),
        ),
        bonus=defensive_bonus + etf_bonus,
    )

    yield_score = weighted_score(
        (
            0.28 * normalized_score(dividend_yield, 0.0, 8.5),
            0.16 * inverse_score(payout_ratio, 25.0, 95.0),
            0.16 * normalized_score(free_cashflow, 0.0, 50_000_000_000.0),
            0.15 * inverse_score(volatility, 0.7, 4.0),
            0.13 * inverse_score(beta, 0.7, 1.6),
            0.08 * normalized_score(operating_margins, 0.0, 30.0),
            0.04 * normalized_score(gross_margins, 20.0, 80.0),
        ),
        bonus=defensive_bonus + etf_bonus + (5 if dividend_yield and dividend_yield > 0 else 0),
    )

    momentum = weighted_score(
        (
            0.28 * normalized_score(weekly_trend, -8.0, 15.0),
            0.24 * normalized_score(monthly_trend, -12.0, 25.0),
            0.18 * normalized_score(quarterly_trend, -18.0, 45.0),
            0.12 * normalized_score(relative_position, 0.0, 1.0),
            0.10 * normalized_score(volume_ratio, 0.6, 2.5),
            0.08 * inverse_score(volatility, 1.0, 5.0),
        ),
        bonus=growth_bonus + (8 if weekly_trend > 0 else 0),
    )

    return {
        "capitalized": clamp(capitalized + growth_bonus),
        "stable_dca": clamp(stable_dca),
        "yield": clamp(yield_score),
        "momentum": clamp(momentum + growth_bonus),
    }


def confidence_from_score(score: float) -> str:
    if score >= 88:
        return "Very high"
    if score >= 76:
        return "High"
    if score >= 62:
        return "Balanced"
    return "Speculative"


def recommendation_from_best_strategy(strategy: StrategyKey, score: float) -> str:
    if strategy == "yield":
        return f"Best for income: {STRATEGY_LABELS[strategy]} setup is around {int(round(score))}% fit."
    if strategy == "momentum":
        return f"Best for trend: {STRATEGY_LABELS[strategy]} setup is around {int(round(score))}% fit."
    if strategy == "stable_dca":
        return f"Best for recurring buys: {STRATEGY_LABELS[strategy]} setup is around {int(round(score))}% fit."
    return f"Best for compounders: {STRATEGY_LABELS[strategy]} setup is around {int(round(score))}% fit."


def story_from_strategy(
    *,
    best_strategy: StrategyKey,
    score: float,
    revenue_growth: float | None,
    dividend_yield: float | None,
    volatility: float,
    weekly_trend: float,
) -> str:
    if best_strategy == "yield":
        yield_part = f"{dividend_yield:.1f}% yield" if dividend_yield is not None else "income profile"
        return f"{yield_part} with {volatility:.1f}% daily volatility and {int(round(score))}% yield fit."
    if best_strategy == "momentum":
        return f"{weekly_trend:.1f}% weekly move and {int(round(score))}% trend fit keep momentum on watch."
    if best_strategy == "stable_dca":
        return f"Calmer tape and resilient cash flow give this name {int(round(score))}% stable DCA fit."
    growth = f"{revenue_growth:.1f}% revenue growth" if revenue_growth is not None else "growth traits"
    return f"{growth} and {int(round(score))}% capitalized fit support long-horizon compounding."


def build_narrative(strategy: StrategyKey, top: dict[str, object] | None) -> dict[str, str]:
    base = STRATEGY_NARRATIVES[strategy]
    if not top:
        return {
            "title": base["title"],
            "summary": base["summary"],
            "positive": base["positive"],
            "negative": base["negative"],
            "recommendation": base["recommendation"],
        }

    score = int(round(top["strategyScores"][strategy]))  # type: ignore[index]
    symbol = top["symbol"]  # type: ignore[index]
    return {
        "title": base["title"],
        "summary": base["summary"],
        "positive": base["positive"],
        "negative": base["negative"],
        "recommendation": f"Best current match: {symbol} - {score}% fit for {STRATEGY_LABELS[strategy]}",
    }
