from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import Request
from fastapi.responses import JSONResponse

from internal.market import detail
from routes import analysis


def _request() -> Request:
    return Request({"type": "http", "method": "POST", "path": "/", "headers": [], "scheme": "https", "server": ("test", 443)})


class AnalystCacheFirstTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
