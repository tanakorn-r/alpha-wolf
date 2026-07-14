from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import Request
from fastapi.responses import JSONResponse

from internal.market import detail
from internal.market import portfolio as portfolio_market
from internal.yahoo import client as yahoo_client
from routes import analysis


def _request() -> Request:
    return Request({"type": "http", "method": "POST", "path": "/", "headers": [], "scheme": "https", "server": ("test", 443)})


class AnalystCacheFirstTests(unittest.TestCase):
    def test_portfolio_quote_overlay_loads_holdings_in_parallel_and_reports_pending(self) -> None:
        holdings = [SimpleNamespace(symbol="AAPL"), SimpleNamespace(symbol="SIRI.BK")]

        def info(_modules, symbol: str):
            return {
                "currentPrice": 200 if symbol == "AAPL" else 1.47,
                "regularMarketPreviousClose": 190 if symbol == "AAPL" else 1.45,
                "currency": "USD" if symbol == "AAPL" else "THB",
            }

        with (
            patch.object(portfolio_market, "list_holdings", return_value=holdings),
            patch.object(portfolio_market, "make_ticker", side_effect=lambda symbol: SimpleNamespace(symbol=symbol)),
            patch.object(portfolio_market, "load_ticker_modules", return_value={}),
            patch.object(portfolio_market, "merge_ticker_info", side_effect=info),
            patch.object(
                portfolio_market,
                "quote_snapshot_meta",
                side_effect=lambda symbol: {"fresh": symbol == "AAPL", "fetchedAt": "2026-07-13T12:00:00+00:00" if symbol == "AAPL" else None},
            ),
        ):
            result = portfolio_market.build_portfolio_quotes(1)

        self.assertEqual([quote["symbol"] for quote in result["quotes"]], ["AAPL", "SIRI.BK"])
        self.assertAlmostEqual(result["quotes"][0]["changePct"], 5.26, places=2)
        self.assertTrue(result["pending"])
        self.assertEqual(result["updatedAt"], "2026-07-13T12:00:00+00:00")

    def test_quote_and_company_snapshots_merge_without_refresh_when_fresh(self) -> None:
        company = {"AAPL": {"price": {"currentPrice": 90}, "summaryProfile": {"sector": "Technology"}}}
        quote = {"AAPL": {"price": {"currentPrice": 100}, "summaryDetail": {"currentPrice": 100}}}

        def load(_symbol: str, data_type: str):
            payload = quote if data_type == "quote" else company
            return SimpleNamespace(payload=payload, is_fresh=True)

        with (
            patch.object(yahoo_client, "load_yahoo_data", side_effect=load),
            patch.object(yahoo_client, "_refresh_in_background") as refresh,
        ):
            result = yahoo_client.load_ticker_modules(SimpleNamespace(), "AAPL")

        self.assertEqual(result["AAPL"]["price"]["currentPrice"], 100)
        self.assertEqual(result["AAPL"]["summaryProfile"]["sector"], "Technology")
        refresh.assert_not_called()

    def test_agent_specific_inputs_skip_unrelated_research_packs(self) -> None:
        self.assertEqual(analysis._analyst_input_flags("rex"), (False, True, False))
        self.assertEqual(analysis._analyst_input_flags("sam"), (True, False, False))
        self.assertEqual(analysis._analyst_input_flags("vera"), (True, False, True))
        self.assertEqual(analysis._analyst_input_flags("alphawolf"), (True, True, True))

    def test_financial_cache_miss_schedules_background_work_without_calling_yahoo(self) -> None:
        with (
            patch.object(detail, "load_yahoo_data", return_value=None),
            patch.object(detail, "cache_get", return_value=None),
            patch.object(detail, "build_ai_financial_snapshot") as build_snapshot,
            patch.object(detail, "_refresh_in_background") as refresh,
        ):
            result = detail.get_ai_financials("AAPL")

        self.assertEqual(result, {})
        build_snapshot.assert_not_called()
        refresh.assert_called_once()

    def test_domain_cache_miss_schedules_background_work_without_calling_yahoo(self) -> None:
        with (
            patch.object(detail, "load_yahoo_data", return_value=None),
            patch.object(detail, "cache_get", return_value=None),
            patch.object(detail, "_refresh_in_background") as refresh,
        ):
            result = detail.get_domain_insights("AAPL")

        self.assertEqual(result, {})
        refresh.assert_called_once()

    def test_report_returns_pending_before_openai_when_quote_is_not_ready(self) -> None:
        pending_bundle = {"stock": {"symbol": "AAPL"}, "dataPending": True}
        with (
            patch.object(analysis, "require_ai_account"),
            patch.object(analysis, "user_id_from_request", return_value=1),
            patch.object(analysis, "account_cache_scope", return_value="user:1"),
            patch.object(analysis, "_position_context", return_value={}),
            patch.object(analysis, "_position_cache_key", return_value="none"),
            patch.object(analysis, "cache_get", return_value=None),
            patch.object(analysis, "_fetch_analysis_data", return_value=(pending_bundle, {}, {}, {})),
            patch.object(analysis, "analyze_with_openai") as openai,
        ):
            response = analysis.analyst_report("AAPL", _request(), {"strategy": "capitalized"}, "vera", False)

        self.assertIsInstance(response, JSONResponse)
        self.assertEqual(response.status_code, 202)
        openai.assert_not_called()

    def test_failed_refresh_returns_last_saved_analyst_report(self) -> None:
        bundle = {"stock": {"symbol": "AAPL", "price": 100}, "history": [{"close": 100}] * 10}
        saved = {
            "signal": "HOLD",
            "confidence": 52,
            "headline": "Saved report",
            "summary": "Saved summary",
            "thesis": "Saved thesis",
            "source": "openai",
            "model": "gpt-test",
            "agent": {"id": "vera"},
            "generatedAt": "2026-07-15T00:00:00+00:00",
        }
        with (
            patch.object(analysis, "require_ai_account"),
            patch.object(analysis, "user_id_from_request", return_value=1),
            patch.object(analysis, "account_cache_scope", return_value="user:1"),
            patch.object(analysis, "_position_context", return_value={}),
            patch.object(analysis, "_position_cache_key", return_value="none"),
            patch.object(analysis, "load_ai_result", return_value=saved),
            patch.object(analysis, "cache_get", return_value=None),
            patch.object(analysis, "_fetch_analysis_data", return_value=(bundle, {}, {}, {})),
            patch.object(analysis, "build_analysis_context", return_value={}),
            patch.object(analysis, "claim_ai_run", return_value=(1, None)),
            patch.object(analysis, "release_ai_run") as release,
            patch.object(analysis, "analyze_brief_with_openai", side_effect=analysis.OpenAIAnalysisError("bad structured output")),
        ):
            response = analysis.analyst_report("AAPL", _request(), {"strategy": "capitalized"}, "vera", True)

        self.assertEqual(response["analysis"], saved)
        self.assertEqual(response["refreshWarning"], "bad structured output")
        release.assert_called_once_with(1)


if __name__ == "__main__":
    unittest.main()
