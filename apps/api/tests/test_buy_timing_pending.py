from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from routes import details


def _request() -> Request:
    return Request({"type": "http", "method": "GET", "path": "/", "headers": [], "scheme": "https", "server": ("test", 443)})


class BuyTimingPendingTests(unittest.TestCase):
    def test_pending_market_data_returns_202_without_spending_ai_call(self) -> None:
        with (
            patch.object(details, "require_ai_account"),
            patch.object(details, "user_id_from_request", return_value=1),
            patch.object(details, "account_cache_scope", return_value="user:1"),
            patch.object(details, "cache_get", return_value=None),
            patch.object(details, "build_buy_timing", return_value={"symbol": "AAPL", "dataPending": True}) as build,
            patch.object(details, "claim_ai_run") as claim,
            patch.object(details, "analyze_buy_timing_with_openai") as openai,
        ):
            response = details.details_buy_timing("AAPL", _request(), "stable_dca", "vera", False)

        self.assertIsInstance(response, JSONResponse)
        self.assertEqual(response.status_code, 202)
        build.assert_called_once_with("AAPL", "stable_dca", refresh_stale=False)
        claim.assert_not_called()
        openai.assert_not_called()

    def test_failed_agent_plan_returns_retryable_error_instead_of_calculated_200(self) -> None:
        calculated = {"symbol": "AAPL", "price": 200.0, "narrativeSource": "calculated"}
        with (
            patch.object(details, "require_ai_account"),
            patch.object(details, "user_id_from_request", return_value=1),
            patch.object(details, "account_cache_scope", return_value="user:1"),
            patch.object(details, "cache_get", return_value=None),
            patch.object(details, "build_buy_timing", return_value=calculated),
            patch.object(details, "claim_ai_run", return_value=(1, None)),
            patch.object(details, "release_ai_run") as release,
            patch.object(details, "analyze_buy_timing_with_openai", side_effect=details.OpenAIAnalysisError("invalid plan")),
            patch.object(details, "cache_set") as cache_set,
        ):
            with self.assertRaises(HTTPException) as caught:
                details.details_buy_timing("AAPL", _request(), "stable_dca", "vera", True)

        self.assertEqual(caught.exception.status_code, 503)
        release.assert_called_once_with(1)
        cache_set.assert_not_called()


if __name__ == "__main__":
    unittest.main()
