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
            "industryRanking": bundle.get("peerRank"),
            "dividendDipPattern": bundle.get("dividendPattern"),
            "recentNews": bundle.get("news"),
            "priceHistory": _compact_price_history(bundle.get("history") or []),
            "financialResearch": financials,
            "marketComparison": market_comparison,
            "sectorAndIndustryResearch": domain_insights,
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
