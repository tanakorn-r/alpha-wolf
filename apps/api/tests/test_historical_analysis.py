from __future__ import annotations

import sys
import unittest
from pathlib import Path

from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.ai.context import build_historical_analysis_context
from internal.ai.openai_client import _historical_analysis_instructions
from models import HistoricalAnalysis, HistoricalAnalysisResponse


def _source() -> dict:
    return {
        "title": "Annual report",
        "url": "https://example.com/annual-report",
        "publisher": "Example Company",
        "publishedAt": None,
        "relevance": 95,
        "sentiment": "MIXED",
        "horizon": "LONG",
        "eventType": "EARNINGS",
        "whyItMatters": "It reports the business economics behind the historical change.",
    }


def _analysis_payload() -> dict:
    event = {
        "period": "2024",
        "priceDirection": "UP",
        "event": "The company reported a material earnings recovery.",
        "businessChange": "Revenue and cash generation improved.",
        "marketImpact": "Expectations and the valuation multiple recovered.",
        "evidenceType": "FILING",
        "sourceRanks": [1],
    }
    return {
        "verdict": "IMPROVING",
        "rating": 74,
        "historyWindow": "5 years plus the current year",
        "headline": "The business recovered before the market fully trusted it",
        "summary": "History shows an earnings recovery supported by better cash economics.",
        "priceStory": "The stock moved through contraction, stabilization, and recovery regimes.",
        "earningsStory": "Reported earnings and cash generation weakened, then recovered.",
        "timeline": [event, {**event, "period": "2025"}, {**event, "period": "2026 YTD"}],
        "currentYear": {
            "direction": "BETTER",
            "whatChanged": "Cash conversion and revenue are improving.",
            "comparisonWithHistory": "The present improvement is broader than the prior false start.",
            "evidence": ["Revenue improved", "Cash conversion improved"],
            "sourceRanks": [1],
        },
        "historyLessons": ["Cash conversion led the durable recovery", "Valuation alone did not mark the bottom"],
        "forwardOutlook": {
            "direction": "IMPROVING",
            "thesis": "The recovery can persist if reinvestment continues to earn acceptable returns.",
            "catalysts": ["Higher returns", "Better demand"],
            "risks": ["Margin reversal", "Debt-funded expansion"],
        },
        "agentConclusion": "History supports cautious ownership while cash economics keep improving.",
        "sources": [_source(), {**_source(), "title": "Exchange filing", "url": "https://example.com/exchange-filing", "publisher": "Example Exchange"}],
    }


class HistoricalAnalysisTests(unittest.TestCase):
    def test_persona_horizons_and_questions_are_distinct(self) -> None:
        ben = _historical_analysis_instructions("ben")
        kai = _historical_analysis_instructions("kai")

        self.assertIn("roughly five years", ben)
        self.assertIn("owner earnings", ben)
        self.assertIn("current year is genuinely improving", ben)
        self.assertIn("last 3-4 months", kai)
        self.assertIn("attention spikes", kai)
        self.assertNotEqual(ben, kai)

    def test_context_changes_window_and_focus_by_agent(self) -> None:
        bundle = {
            "stock": {"symbol": "TEST", "name": "Test Co"},
            "business": {"sector": "Industrials", "industry": "Tools", "revenueGrowth": 0.1},
            "history": [{"date": "2026-01-01", "close": 10.0}],
        }
        monthly = [{"date": "2025-01-31", "close": 8.0}, {"date": "2026-01-31", "close": 10.0}]
        ben = build_historical_analysis_context(bundle, agent_id="ben", monthly_price_history=monthly)
        kai = build_historical_analysis_context(bundle, agent_id="kai", monthly_price_history=monthly)

        self.assertEqual(ben["historyContract"]["window"], "5 years plus the current year")
        self.assertEqual(kai["historyContract"]["window"], "the last 3-4 months")
        self.assertIn("moat", ben["historyContract"]["focus"])
        self.assertIn("momentum bursts", kai["historyContract"]["focus"])
        self.assertEqual(ben["monthlyPriceHistory"], monthly)

    def test_schema_rejects_nonexistent_source_rank(self) -> None:
        payload = _analysis_payload()
        parsed = HistoricalAnalysis.model_validate(payload)
        self.assertEqual(parsed.currentYear.direction, "BETTER")

        payload["timeline"][0]["sourceRanks"] = [3]
        with self.assertRaises(ValidationError):
            HistoricalAnalysis.model_validate(payload)

    def test_response_accepts_saved_result_audit_metadata(self) -> None:
        response = HistoricalAnalysisResponse.model_validate({
            **_analysis_payload(),
            "symbol": "TEST",
            "source": "openai",
            "model": "test-model",
            "agent": {"id": "ben", "name": "Ben Hathaway", "mono": "BH", "title": "The Quality Owner", "color": "#d6b36a", "avatarUrl": "/agents/ben.png"},
            "generatedAt": "2026-07-22T08:00:00+00:00",
            "decisionState": {"id": "state-1"},
            "guardedDecision": {"feature": "history"},
            "qualityChecks": [{"name": "shared_state_consistency", "passed": True}],
            "promptVersion": "history/production-v1",
            "runId": "run-1",
        })

        self.assertEqual(response.guardedDecision["feature"], "history")


if __name__ == "__main__":
    unittest.main()
