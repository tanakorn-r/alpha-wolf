from __future__ import annotations

from typing import Any

from internal.store.utils import json_safe

MAX_PRICE_POINTS = 120


def build_analysis_context(
    bundle: dict[str, Any],
    *,
    financials: dict[str, Any] | None,
    market_comparison: dict[str, Any] | None,
    domain_insights: dict[str, Any] | None,
) -> dict[str, Any]:
    return json_safe(
        {
            "stock": bundle.get("stock"),
            "selectedStrategy": bundle.get("strategy"),
            "business": bundle.get("business"),
            "performance": bundle.get("performance"),
            "technicals": bundle.get("technicals"),
            "platformVerdict": bundle.get("verdict"),
            "platformOutlook": bundle.get("outlook"),
            "industryRanking": bundle.get("peerRank"),
            "dividendDipPattern": bundle.get("dividendPattern"),
            "recentNews": bundle.get("news"),
            "priceHistory": _compact_price_history(bundle.get("history") or []),
            "financialResearch": financials,
            "marketComparison": market_comparison,
            "sectorAndIndustryResearch": domain_insights,
            "agentProfile": _agent_profile(bundle.get("strategy"), bundle.get("mode")),
            "quantScorecard": _build_quant_scorecard(bundle, market_comparison),
        }
    )


def _compact_price_history(history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if len(history) <= MAX_PRICE_POINTS:
        return history
    step = max(1, len(history) // MAX_PRICE_POINTS)
    sampled = history[::step]
    if sampled[-1] != history[-1]:
        sampled.append(history[-1])
    return sampled


def _build_quant_scorecard(bundle: dict[str, Any], market_comparison: dict[str, Any] | None) -> dict[str, Any]:
    stock = bundle.get("stock") or {}
    business = bundle.get("business") or {}
    technicals = bundle.get("technicals") or {}
    performance = bundle.get("performance") or {}
    returns = performance.get("returns") or {}
    peer_rank = bundle.get("peerRank") or {}
    verdict = bundle.get("verdict") or {}

    price = _num(stock.get("price"))
    support = _num(technicals.get("support"))
    resistance = _num(technicals.get("resistance"))
    rsi = _num(technicals.get("rsi14"))
    volume_ratio = _num(technicals.get("volumeRatio"))
    macd = _num(technicals.get("macd"))
    macd_signal = _num(technicals.get("macdSignal"))
    sma20 = _num(technicals.get("sma20"))
    sma50 = _num(technicals.get("sma50"))
    sma200 = _num(technicals.get("sma200"))
    volatility = _num(technicals.get("volatility"))

    technical = 50.0
    if price and sma20 and sma50 and sma200:
        technical += 18 if price > sma20 > sma50 > sma200 else 8 if price > sma50 > sma200 else -14 if price < sma50 else 0
    if macd is not None and macd_signal is not None:
        technical += 10 if macd > macd_signal else -10
    if rsi is not None:
        technical += 10 if 45 <= rsi <= 64 else 3 if 65 <= rsi <= 70 else -8 if 71 <= rsi <= 78 else -22 if rsi > 78 else -10 if rsi < 32 else 0
    if volume_ratio is not None:
        technical += 10 if volume_ratio >= 1.25 else -10 if volume_ratio < 0.7 else 0
    if price and resistance:
        gap_to_resistance = ((resistance - price) / price) * 100
        technical += 8 if 4 <= gap_to_resistance <= 12 else -14 if gap_to_resistance < 2 else 0
    if price and support:
        gap_to_support = ((price - support) / price) * 100
        technical += 8 if 0 <= gap_to_support <= 5 else -12 if gap_to_support > 15 else 0

    business_score = 50.0
    revenue_growth = _num(business.get("revenueGrowth"))
    earnings_growth = _num(business.get("earningsGrowth"))
    profit_margin = _num(business.get("profitMargin"))
    roe = _num(business.get("roe"))
    pe = _num(business.get("peRatio"))
    pbv = _num(business.get("priceToBook"))
    target = _num(business.get("targetMeanPrice"))
    if revenue_growth is not None:
        business_score += 14 if revenue_growth >= 20 else 7 if revenue_growth >= 8 else -10 if revenue_growth < 0 else 0
    if earnings_growth is not None:
        business_score += 14 if earnings_growth >= 25 else 7 if earnings_growth >= 8 else -12 if earnings_growth < 0 else 0
    if profit_margin is not None:
        business_score += 8 if profit_margin >= 12 else -7 if profit_margin < 4 else 0
    if roe is not None:
        business_score += 7 if roe >= 15 else -5 if roe < 5 else 0
    if pe is not None and pe > 0:
        business_score += 5 if pe <= 22 else -8 if pe >= 60 else -3 if pe >= 35 else 0
    if pbv is not None and pbv > 0:
        business_score += 4 if pbv <= 3 else -6 if pbv >= 10 else 0
    if price and target:
        business_score += 10 if target >= price * 1.15 else -10 if target < price else 0

    relative = 50.0
    ytd = _num(returns.get("ytd"))
    one_year = _num(returns.get("1y"))
    if ytd is not None:
        relative += 12 if ytd >= 25 else 6 if ytd >= 8 else -8 if ytd < -10 else 0
    if one_year is not None:
        relative += 18 if one_year >= 40 else 10 if one_year >= 15 else -10 if one_year < -15 else 0
    rank = _num(peer_rank.get("rank"))
    count = _num(peer_rank.get("count"))
    if rank and count:
        percentile = rank / count
        relative += 10 if percentile <= 0.2 else -8 if percentile >= 0.75 else 0
    stock_return = _num((market_comparison or {}).get("stock", {}).get("returnPct"))
    benchmark_return = _num((market_comparison or {}).get("benchmark", {}).get("returnPct"))
    if stock_return is not None and benchmark_return is not None:
        gap = stock_return - benchmark_return
        relative += 10 if gap >= 15 else -8 if gap <= -10 else 0

    platform = _num(verdict.get("score")) or 50.0
    swing = _swing_entry_score(
        price=price,
        support=support,
        resistance=resistance,
        rsi=rsi,
        volume_ratio=volume_ratio,
        sma20=sma20,
        sma50=sma50,
        volatility=volatility,
        target=target,
    )
    score = round(_clamp(0.34 * swing + 0.24 * technical + 0.18 * business_score + 0.14 * relative + 0.10 * platform, 1, 100))
    positives: list[str] = []
    negatives: list[str] = []
    if one_year is not None and one_year >= 40:
        positives.append(f"1Y return is extreme at {one_year:.1f}%")
    if revenue_growth is not None and revenue_growth >= 20:
        positives.append(f"revenue growth is strong at {revenue_growth:.1f}%")
    if earnings_growth is not None and earnings_growth >= 25:
        positives.append(f"earnings growth is strong at {earnings_growth:.1f}%")
    if price and sma20 and sma50 and sma200 and price > sma20 > sma50 > sma200:
        positives.append("price is above rising key moving averages")
    if volume_ratio is not None and volume_ratio < 0.7:
        negatives.append(f"volume is weak at {volume_ratio:.2f}x average")
    if pe is not None and pe >= 60:
        negatives.append(f"valuation is stretched at {pe:.1f}x PE")
    if price and resistance and ((resistance - price) / price) * 100 < 5:
        negatives.append(f"price is close to resistance near {resistance:.2f}")
    if price and target and target < price:
        negatives.append("analyst mean target is below current price")
    if rsi is not None and rsi > 78:
        negatives.append(f"RSI is overextended at {rsi:.1f}, which is poor swing-entry timing")
    if price and support and resistance:
        risk = price - support
        reward = resistance - price
        if risk > 0 and reward > 0 and reward / risk < 0.7:
            negatives.append(f"reward/risk to resistance is weak at {reward / risk:.2f}x")
    return {
        "score": score,
        "bands": {
            "90-100": "rare: buy now only when technical timing, business quality, volume, and market context all agree",
            "75-89": "strong: high-quality setup, but one important risk may still need confirmation",
            "55-74": "watch/wait: enough positives to track, but not clean enough for aggressive deployment",
            "35-54": "weak/mixed: capital should wait for better evidence",
            "1-34": "avoid: broken trend, poor fundamentals, or risk overwhelms reward",
        },
        "componentScores": {
            "technicalTiming": round(_clamp(technical, 1, 100)),
            "swingEntry": round(_clamp(swing, 1, 100)),
            "businessQuality": round(_clamp(business_score, 1, 100)),
            "relativeStrength": round(_clamp(relative, 1, 100)),
            "platformSetup": round(_clamp(platform, 1, 100)),
        },
        "positives": positives[:5],
        "negatives": negatives[:5],
        "instruction": "Use this scorecard as numeric context only. Do not copy its wording. Write the investment thesis from the full supplied data.",
    }


def _agent_profile(strategy: Any, mode: Any = None) -> dict[str, Any]:
    selected = str(strategy or "").strip().lower()
    selected_mode = str(mode or "").strip().lower()
    if selected == "momentum" and selected_mode != "fomo":
        return {
            "name": "Alpha Wolf Swing Investor",
            "role": "A real swing-trading investor who looks for a support/low-zone turn, not an already-extended winner.",
            "decisionOrder": [
                "Classify the setup: support turn, pullback base, early reversal, failed reversal, extended breakout, exhaustion, or no-trade.",
                "Check swing entry quality: closeness to support/low zone, evidence that the turn has started, distance to resistance, volume confirmation, and reward/risk.",
                "Then check business/sector context as a tailwind or veto, not as a reason to chase a bad entry.",
                "Return BUY only when the entry is near the low/support zone or has just turned up from it. Return WATCH when the stock is good but already extended.",
                "Return AVOID when reward/risk, trend, or fundamentals are poor.",
            ],
            "biasControl": "Do not favor bull-market winners by default. A strong uptrend near resistance is a FOMO/Momentum setup, not a Swing Trade buy.",
            "buyNowRequirements": [
                "clear support nearby or price has just bounced from a low/base",
                "upside to resistance/target is larger than downside to invalidation",
                "volume confirms the turn or pullback risk is controlled",
                "RSI is not in exhaustion; the setup should feel early, not chased",
            ],
        }
    return {
        "name": "Alpha Wolf Investor",
        "role": "A practical investor who decides whether the stock fits the selected strategy and whether the current price is worth deploying capital.",
        "decisionOrder": [
            "Judge the current entry, not only company quality.",
            "Compare upside, downside, valuation, trend, and catalyst support.",
            "Separate good company from good buy.",
        ],
        "biasControl": "Do not reward winners automatically; demand a valid entry and reward/risk.",
    }


def _swing_entry_score(
    *,
    price: float | None,
    support: float | None,
    resistance: float | None,
    rsi: float | None,
    volume_ratio: float | None,
    sma20: float | None,
    sma50: float | None,
    volatility: float | None,
    target: float | None,
) -> float:
    score = 50.0
    if price and support and resistance:
        downside = max(price - support, 0.01)
        upside = max(resistance - price, 0.0)
        reward_risk = upside / downside
        score += 22 if reward_risk >= 1.6 else 10 if reward_risk >= 1.0 else -18 if reward_risk < 0.7 else -8
        gap_to_resistance = (resistance - price) / price * 100
        gap_to_support = (price - support) / price * 100
        score += 18 if 1 <= gap_to_support <= 6 else 8 if 0 <= gap_to_support < 1 else -16 if gap_to_support > 12 else 0
        score += 10 if gap_to_resistance >= 6 else -18 if gap_to_resistance < 2 else 0
    if rsi is not None:
        score += 16 if 40 <= rsi <= 58 else 7 if 58 < rsi <= 66 else -14 if 66 < rsi <= 75 else -30 if rsi > 75 else -8 if rsi < 32 else 0
    if volume_ratio is not None:
        score += 12 if volume_ratio >= 1.05 else -12 if volume_ratio < 0.7 else 0
    if price and sma20 and sma50:
        gap_to_sma20 = abs(price - sma20) / price * 100
        score += 10 if price >= sma20 and gap_to_sma20 <= 5 else 4 if price > sma50 else -12
    if price and target:
        upside_to_target = (target - price) / price * 100
        score += 10 if upside_to_target >= 12 else -14 if upside_to_target < 0 else -5 if upside_to_target < 5 else 0
    if volatility is not None and volatility > 6:
        score -= 4
    return _clamp(score, 1, 100)


def _num(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))
