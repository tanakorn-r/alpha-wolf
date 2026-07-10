from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.ai.context import build_analysis_context
from internal.ai.openai_client import _selected_model
from routes.analysis import _fetch_analysis_data


class AiPerformanceTests(unittest.TestCase):
    def test_today_profile_skips_heavy_research_sources(self) -> None:
        with (
            patch("routes.analysis.build_detail_bundle", return_value={"stock": {"symbol": "TEST"}}),
            patch("routes.analysis.get_ai_financials") as financials,
            patch("routes.analysis.get_market_comparison") as market,
            patch("routes.analysis.get_domain_insights") as insights,
        ):
            bundle, financial_data, market_data, insight_data = _fetch_analysis_data(
                "TEST",
                "capitalized",
                include_financials=False,
                include_market=False,
                include_insights=False,
            )

        self.assertEqual(bundle, {"stock": {"symbol": "TEST"}})
        self.assertEqual((financial_data, market_data, insight_data), ({}, {}, {}))
        financials.assert_not_called()
        market.assert_not_called()
        insights.assert_not_called()

    def test_model_context_caps_large_research_arrays(self) -> None:
        bundle = {
            "stock": {"symbol": "TEST", "price": 100},
            "strategy": "capitalized",
            "business": {},
            "performance": {},
            "technicals": {},
            "verdict": {},
            "outlook": {},
            "peerRank": {},
            "dividendPattern": {},
            "news": [],
            "history": [{"date": str(index), "close": index} for index in range(200)],
        }
        financials = {
            "incomeStatement": {"latest": {}, "history": list(range(20))},
            "dividends": list(range(30)),
        }
        market = {"points": list(range(50))}
        insights = {
            "sectorInsight": {"industries": list(range(20))},
            "industryInsight": {"topPerformingCompanies": list(range(20))},
        }

        context = build_analysis_context(
            bundle,
            financials=financials,
            market_comparison=market,
            domain_insights=insights,
            agent_id="vera",
        )

        self.assertLessEqual(len(context["priceHistory"]), 72)
        self.assertEqual(len(context["financialResearch"]["incomeStatement"]["history"]), 3)
        self.assertEqual(len(context["financialResearch"]["dividends"]), 12)
        self.assertEqual(len(context["marketComparison"]["points"]), 18)
        self.assertEqual(len(context["sectorAndIndustryResearch"]["sectorInsight"]["industries"]), 5)

    def test_fast_tasks_default_to_lower_latency_model(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(_selected_model(), "gpt-5.5")
            self.assertEqual(_selected_model(fast=True), "gpt-5.4-mini")


if __name__ == "__main__":
    unittest.main()
