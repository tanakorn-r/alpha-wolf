from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException, Request
from pydantic import ValidationError

from models import StrategyRecommendationRequest
from routes import analysis


def _request() -> Request:
    return Request({"type": "http", "method": "POST", "path": "/api/strategy/recommendations", "headers": []})


def _catalog() -> list[dict[str, object]]:
    return [
        {"symbol": symbol, "name": symbol, "strategyScores": {"momentum": 70}, "price": 100}
        for symbol in ("AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOG")
    ]


def _pick(symbol: str) -> dict[str, object]:
    return {
        "ticker": symbol,
        "name": symbol,
        "action": "BUY",
        "conviction": 75,
        "reason": "Strong evidence",
        "entry": 100,
        "target": 120,
        "stop": 90,
    }


class StrategyTopFiveTests(unittest.TestCase):
    def test_analyst_ranking_context_is_bounded_and_symbol_scoped(self) -> None:
        context = analysis._analyst_ranking_context({
            "rankingContext": {
                "ticker": "aapl",
                "rank": 1,
                "total": 5,
                "mode": "long",
                "strategyLabel": "Long-Term",
                "action": "ACCUMULATE",
                "conviction": 84,
                "reason": "Best compounder in the screened set.",
            }
        }, "AAPL")

        self.assertEqual(context["rank"], 1)
        self.assertEqual(context["mode"], "long")
        self.assertIn("relative rank", context["interpretation"])
        self.assertIsNone(analysis._analyst_ranking_context({"rankingContext": {"ticker": "MSFT"}}, "AAPL"))

    def test_request_requires_five_to_forty_unique_normalized_candidates(self) -> None:
        request = StrategyRecommendationRequest(
            strategy="momentum",
            candidateSymbols=[" aapl ", "msft", "NVDA", "amzn", "META"],
        )
        self.assertEqual(request.candidateSymbols, ["AAPL", "MSFT", "NVDA", "AMZN", "META"])

        with self.assertRaises(ValidationError):
            StrategyRecommendationRequest(strategy="momentum", candidateSymbols=["AAPL"] * 5)
        with self.assertRaises(ValidationError):
            StrategyRecommendationRequest(strategy="momentum", candidateSymbols=["AAPL", "MSFT", "NVDA", "AMZN", " "])

    def test_filter_never_accepts_off_pool_or_duplicate_symbols(self) -> None:
        result = analysis._filter_strategy_picks(
            {"picks": [_pick("AAPL"), _pick("TSLA"), _pick("AAPL"), _pick("MSFT")]},
            _catalog(),
            5,
            "momentum",
        )
        self.assertEqual([pick["ticker"] for pick in result["picks"]], ["AAPL", "MSFT"])

    def test_cached_ranking_reopens_without_claiming_a_token(self) -> None:
        payload = StrategyRecommendationRequest(
            strategy="momentum",
            candidateSymbols=["AAPL", "MSFT", "NVDA", "AMZN", "META"],
        )
        cached = {"strategy": "momentum", "picks": [_pick(symbol) for symbol in payload.candidateSymbols]}
        with (
            patch.object(analysis, "require_ai_account"),
            patch.object(analysis, "user_id_from_request", return_value=7),
            patch.object(analysis, "account_cache_scope", return_value="user:7"),
            patch.object(analysis, "_load_saved_ai_result", return_value=cached),
            patch.object(analysis, "get_market_catalog") as catalog,
            patch.object(analysis, "claim_ai_run") as claim,
        ):
            result = analysis.strategy_recommendations(payload, _request(), "vera", False)

        self.assertIs(result, cached)
        catalog.assert_not_called()
        claim.assert_not_called()

    def test_incomplete_agent_output_refunds_token(self) -> None:
        payload = StrategyRecommendationRequest(
            strategy="momentum",
            candidateSymbols=["AAPL", "MSFT", "NVDA", "AMZN", "META"],
        )
        request = _request()
        with (
            patch.object(analysis, "require_ai_account"),
            patch.object(analysis, "user_id_from_request", return_value=7),
            patch.object(analysis, "account_cache_scope", return_value="user:7"),
            patch.object(analysis, "_load_saved_ai_result", return_value=None),
            patch.object(analysis, "get_market_catalog", return_value=_catalog()),
            patch.object(analysis, "claim_ai_run", return_value=(7, None)) as claim,
            patch.object(analysis, "recommend_strategy_with_openai", return_value={"picks": [_pick("AAPL"), _pick("AAPL"), _pick("TSLA")]}),
            patch.object(analysis, "build_universe_data_trust", return_value={}),
            patch.object(analysis, "record_ai_failure") as record_failure,
            patch.object(analysis, "release_ai_run") as release,
        ):
            with self.assertRaises(HTTPException) as raised:
                analysis.strategy_recommendations(payload, request, "vera", True)

        self.assertEqual(raised.exception.status_code, 503)
        claim.assert_called_once_with(request)
        release.assert_called_once_with(7)
        record_failure.assert_called_once()


if __name__ == "__main__":
    unittest.main()
