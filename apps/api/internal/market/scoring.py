from __future__ import annotations

import math
from typing import Literal

from models import UniverseEntry

StrategyKey = Literal["capitalized", "stable_dca", "yield", "momentum"]

STRATEGY_LABELS: dict[StrategyKey, str] = {
    "capitalized": "Value",
    "stable_dca": "Dividend Dips",
    "yield": "Income",
    "momentum": "Growth",
}

STRATEGY_NARRATIVES: dict[StrategyKey, dict[str, str]] = {
    "capitalized": {
        "title": "Value / quality",
        "summary": "Focus on durable businesses with quality fundamentals trading away from their highs.",
        "positive": "Upside improves when business quality is intact and the entry is less crowded.",
        "negative": "Cheap-looking stocks can stay cheap if growth, cash flow, or balance-sheet quality fades.",
        "recommendation": "Prioritize quality names with better entry value in the live universe.",
    },
    "stable_dca": {
        "title": "Dividend dips",
        "summary": "Prefer dividend payers with cash support, calmer risk, and a recent pullback.",
        "positive": "A cleaner dip can improve yield-on-cost without chasing weak businesses.",
        "negative": "A sharp drop can be a warning if cash flow or balance-sheet support is missing.",
        "recommendation": "Lean toward dividend names where the pullback looks orderly and funded.",
    },
    "yield": {
        "title": "Income-first",
        "summary": "Optimize for cash return and balance sheet resilience rather than just speed.",
        "positive": "Good income profiles can make holding through volatility feel much better.",
        "negative": "High yield is only attractive if the business can keep supporting it.",
        "recommendation": "Favor strong dividend payers with clean payout support and steady cash flow.",
    },
    "momentum": {
        "title": "Growth leaders",
        "summary": "Look for businesses with growth support and a trend that confirms buyers still care.",
        "positive": "Growth can compound fastest when fundamentals and price action agree.",
        "negative": "Fast growers can re-rate quickly when momentum or revenue growth cools.",
        "recommendation": "Favor names where business growth and recent strength line up.",
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


def known_normalized(value: float | None, low: float, high: float) -> float | None:
    if value is None:
        return None
    return normalized_score(value, low, high)


def known_inverse(value: float | None, low: float, high: float) -> float | None:
    if value is None:
        return None
    return inverse_score(value, low, high)


def known_log_scale(value: float | None, low_log: float, high_log: float) -> float | None:
    if value is None or value <= 0:
        return None
    return log_scale(value, low_log, high_log)


def weighted_known(parts: tuple[tuple[float | None, float], ...], fallback: float = 40.0) -> float:
    known = [(score, weight) for score, weight in parts if score is not None and weight > 0]
    if not known:
        return fallback
    total = sum(weight for _, weight in known)
    return clamp(sum(score * weight for score, weight in known) / total)


def distributed_fit(score: float, *, center: float = 52.0, spread: float = 1.34) -> float:
    shaped = center + ((score - center) * spread)
    if score >= 78:
        shaped += 4
    elif score >= 68:
        shaped += 2
    elif score <= 34:
        shaped -= 7
    elif score <= 44:
        shaped -= 4
    return clamp(shaped)


def dividend_dip_score(weekly_trend: float, monthly_trend: float) -> float:
    weekly_component = inverse_score(weekly_trend, -8.0, 6.0)
    monthly_component = inverse_score(monthly_trend, -12.0, 10.0)
    panic_penalty = max(0.0, abs(min(weekly_trend + 8.0, 0.0)) * 4.0) + max(0.0, abs(min(monthly_trend + 15.0, 0.0)) * 2.0)
    return clamp((0.58 * weekly_component) + (0.42 * monthly_component) - panic_penalty)


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
    one_year_return: float | None = None,
    pe_ratio: float | None = None,
    price_to_book: float | None = None,
    return_on_equity: float | None = None,
    return_on_assets: float | None = None,
    profit_margins: float | None = None,
) -> dict[StrategyKey, float]:
    defensive_bonus = 10 if "defensive" in entry.indexes or "dividend" in entry.indexes else 0
    growth_bonus = 8 if "growth" in entry.indexes else 0
    etf_bonus = 4 if "etf" in entry.indexes else 0
    dip_score = dividend_dip_score(weekly_trend, monthly_trend)
    liquidity = known_log_scale(market_cap, 8.5, 12.7)
    volume = known_normalized(volume_ratio, 0.55, 2.6)
    has_business_quality = any(
        value is not None
        for value in (
            return_on_equity,
            return_on_assets,
            profit_margins,
            operating_margins,
            gross_margins,
            free_cashflow,
            debt_to_equity,
        )
    )
    has_entry_evidence = any(value is not None for value in (relative_position, pe_ratio, price_to_book, one_year_return))
    has_income_support = any(value is not None for value in (payout_ratio, free_cashflow, operating_margins, profit_margins, return_on_equity))
    quality = weighted_known(
        (
            (known_normalized(return_on_equity, 0.0, 24.0), 0.18),
            (known_normalized(return_on_assets, 0.0, 12.0), 0.10),
            (known_normalized(profit_margins, -4.0, 28.0), 0.15),
            (known_normalized(operating_margins, 0.0, 35.0), 0.14),
            (known_normalized(gross_margins, 20.0, 80.0), 0.08),
            (known_normalized(free_cashflow, 0.0, 40_000_000_000.0), 0.12),
            (known_inverse(debt_to_equity, 35.0, 230.0), 0.12),
            (liquidity, 0.11),
        ),
        fallback=38.0,
    )
    if not has_business_quality:
        quality = min(quality, 62.0 if market_cap else 42.0)
    growth = weighted_known(
        (
            (known_normalized(revenue_growth, -12.0, 40.0), 0.36),
            (known_normalized(one_year_return, -35.0, 90.0), 0.22),
            (known_normalized(quarterly_trend, -18.0, 45.0), 0.18),
            (known_normalized(monthly_trend, -12.0, 25.0), 0.14),
            (known_normalized(weekly_trend, -8.0, 15.0), 0.10),
        ),
        fallback=36.0,
    )
    entry_value = weighted_known(
        (
            (known_inverse(relative_position, 0.25, 1.0), 0.34),
            (known_inverse(pe_ratio, 8.0, 45.0), 0.20),
            (known_inverse(price_to_book, 0.6, 8.0), 0.16),
            (known_inverse(one_year_return, -35.0, 95.0), 0.18),
            (known_inverse(monthly_trend, -12.0, 18.0), 0.08),
            (known_inverse(weekly_trend, -8.0, 8.0), 0.04),
        ),
        fallback=34.0,
    )
    income = weighted_known(
        (
            (known_normalized(dividend_yield, 0.0, 8.5), 0.58),
            (known_inverse(payout_ratio, 25.0, 95.0), 0.14),
            (known_normalized(free_cashflow, 0.0, 50_000_000_000.0), 0.14),
            (known_inverse(volatility, 0.7, 4.0), 0.08),
            (known_inverse(beta, 0.7, 1.6), 0.06),
        ),
        fallback=24.0,
    )
    risk_control = weighted_known(
        (
            (known_inverse(volatility, 0.7, 4.0), 0.32),
            (known_inverse(beta, 0.7, 1.7), 0.22),
            (known_inverse(debt_to_equity, 35.0, 230.0), 0.20),
            (known_normalized(free_cashflow, 0.0, 40_000_000_000.0), 0.14),
            (known_inverse(relative_position, 0.65, 1.0), 0.12),
        ),
        fallback=42.0,
    )
    trend = weighted_known(
        (
            (known_normalized(weekly_trend, -8.0, 15.0), 0.24),
            (known_normalized(monthly_trend, -12.0, 25.0), 0.24),
            (known_normalized(quarterly_trend, -18.0, 45.0), 0.18),
            (known_normalized(one_year_return, -35.0, 90.0), 0.14),
            (known_normalized(relative_position, 0.0, 1.0), 0.10),
            (volume, 0.10),
        ),
        fallback=34.0,
    )

    capitalized_raw = weighted_score(
        (
            0.32 * entry_value,
            0.28 * quality,
            0.16 * growth,
            0.14 * risk_control,
            0.10 * (liquidity if liquidity is not None else 36.0),
        ),
        bonus=(-10 if relative_position is not None and relative_position >= 0.92 else 0)
        + (-7 if pe_ratio is not None and pe_ratio >= 55 else 0)
        + (-14 if not has_entry_evidence else 0)
        + (-6 if not has_business_quality else 0)
        + growth_bonus,
    )

    stable_dca_raw = weighted_score(
        (
            0.28 * income,
            0.25 * risk_control,
            0.20 * dip_score,
            0.16 * quality,
            0.11 * entry_value,
        ),
        bonus=defensive_bonus + etf_bonus + (-12 if not dividend_yield else 0),
    )

    yield_raw = weighted_score(
        (
            0.44 * income,
            0.22 * risk_control,
            0.18 * quality,
            0.10 * entry_value,
            0.06 * dip_score,
        ),
        bonus=defensive_bonus
        + etf_bonus
        + (6 if dividend_yield and dividend_yield >= 3 else 0)
        + (-18 if not dividend_yield else 0)
        + (-10 if dividend_yield and dividend_yield >= 5 and not has_income_support else 0),
    )

    momentum_raw = weighted_score(
        (
            0.36 * trend,
            0.24 * growth,
            0.16 * quality,
            0.12 * (volume if volume is not None else 34.0),
            0.12 * risk_control,
        ),
        bonus=growth_bonus
        + (7 if weekly_trend > 0 and monthly_trend > 0 else 0)
        + (-12 if weekly_trend < 0 and monthly_trend < 0 else 0)
        + (-7 if volume_ratio is not None and volume_ratio < 0.65 else 0),
    )

    return {
        "capitalized": distributed_fit(capitalized_raw, center=49.0, spread=1.58),
        "stable_dca": distributed_fit(stable_dca_raw, center=50.0, spread=1.42),
        "yield": distributed_fit(yield_raw, center=50.0, spread=1.48),
        "momentum": distributed_fit(momentum_raw, center=53.0, spread=1.38),
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
        return f"Best for growth: {STRATEGY_LABELS[strategy]} setup is around {int(round(score))}% fit."
    if strategy == "stable_dca":
        return f"Best for dips: {STRATEGY_LABELS[strategy]} setup is around {int(round(score))}% fit."
    return f"Best for value: {STRATEGY_LABELS[strategy]} setup is around {int(round(score))}% fit."


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
        growth = f"{revenue_growth:.1f}% revenue growth" if revenue_growth is not None else "growth profile"
        return f"{growth}, {weekly_trend:.1f}% weekly move, and {int(round(score))}% growth fit keep this on watch."
    if best_strategy == "stable_dca":
        return f"Dividend support, calmer risk, and a recent dip give this name {int(round(score))}% dividend-dip fit."
    growth = f"{revenue_growth:.1f}% revenue growth" if revenue_growth is not None else "growth traits"
    return f"{growth}, quality, and entry value give this name {int(round(score))}% value fit."


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
