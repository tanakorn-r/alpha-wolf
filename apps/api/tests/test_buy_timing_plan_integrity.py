from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.ai import openai_client
from internal.ai.openai_client import _buy_timing_needs_reconsideration, analyze_buy_timing_with_openai
from internal.store import cache
from models import BuyTimingNarrative


MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _narrative(*, action: str = "WAIT", score: int = 34, buy_month: str | None = None, fit: str = "neutral") -> BuyTimingNarrative:
    return BuyTimingNarrative.model_validate({
        "headline": "Plan",
        "summary": "Summary",
        "action": action,
        "perspectiveScore": score,
        "perspectiveReason": "Reason",
        "recap": "Recap",
        "agentFit": fit,
        "agentFitReason": "Fit",
        "todayInstruction": "Instruction",
        "nextMove": "Move",
        "nextMoveTiming": "Timing",
        "buyCondition": "Condition",
        "reduceCondition": "Condition",
        "monthlyPlan": [
            {
                "month": month,
                "action": "BUY" if month == buy_month else "HOLD",
                "buyBudgetPct": 50 if month == buy_month else 0,
                "trimPositionPct": 0,
                "reason": "Persona reason",
            }
            for month in MONTHS
        ],
    })


def _context(*, structure: str = "MIXED", range_pct: float = 20, vs_average_pct: float = -18) -> dict:
    return {
        "buyTiming": {
            "priceContext": {"currentPct": range_pct, "vsAvgPct": vs_average_pct},
            "entryBand": {"isAtOrBelowEntry": False},
            "businessStructure": {"status": structure},
        }
    }


def _fund_long_horizon_plan(result: BuyTimingNarrative) -> None:
    for item in result.monthlyPlan[:6]:
        item.action = "BUY"
        item.buyBudgetPct = 100


class BuyTimingPlanIntegrityTests(unittest.TestCase):
    def test_aligned_plan_requires_one_full_best_month(self) -> None:
        result = _narrative(buy_month="Mar", fit="aligned")
        self.assertTrue(_buy_timing_needs_reconsideration(_context(), result, "sam"))
        result.monthlyPlan[2].buyBudgetPct = 100
        self.assertFalse(_buy_timing_needs_reconsideration(_context(), result, "sam"))

    def test_aligned_plan_places_largest_buy_in_top_supplied_opportunity(self) -> None:
        context = _context()
        context["buyTiming"]["monthlyMap"] = [
            {"month": month, "score": 90 if month == "Sep" else index}
            for index, month in enumerate(MONTHS)
        ]
        result = _narrative(buy_month="Mar", fit="aligned")
        result.monthlyPlan[2].buyBudgetPct = 100
        self.assertTrue(_buy_timing_needs_reconsideration(context, result, "sam"))
        result.monthlyPlan[2].buyBudgetPct = 50
        result.monthlyPlan[8].action = "BUY"
        result.monthlyPlan[8].buyBudgetPct = 100
        self.assertFalse(_buy_timing_needs_reconsideration(context, result, "sam"))

    def test_identical_structured_requests_share_short_lived_result(self) -> None:
        result = _narrative(buy_month="Mar")
        with cache._CACHE_LOCK:
            cache._CACHE.clear()
        with patch.object(openai_client, "_run_openai_structured_request_uncached", return_value=result) as uncached:
            kwargs = {
                "context": {"dedupTest": "unique-buy-timing"},
                "schema_model": BuyTimingNarrative,
                "schema_name": "dedup_test",
                "instructions": "Return the test plan.",
                "max_output_tokens": 100,
                "model": "test-model",
            }
            first = openai_client._run_openai_structured_request(**kwargs)
            second = openai_client._run_openai_structured_request(**kwargs)

        self.assertEqual(first, second)
        uncached.assert_called_once()

    def test_neutral_agent_may_reject_even_when_price_is_favorable(self) -> None:
        self.assertFalse(_buy_timing_needs_reconsideration(_context(), _narrative()))

    def test_accepts_persona_plan_when_any_month_deploys_money(self) -> None:
        self.assertFalse(_buy_timing_needs_reconsideration(_context(), _narrative(buy_month="Mar")))

    def test_accepts_explicit_low_score_rejection(self) -> None:
        self.assertFalse(_buy_timing_needs_reconsideration(_context(), _narrative(action="AVOID", score=20)))

    def test_does_not_force_reconsideration_for_at_risk_business(self) -> None:
        self.assertFalse(_buy_timing_needs_reconsideration(_context(structure="AT_RISK"), _narrative()))

    def test_accepts_vera_selective_allocation_without_forcing_a_second_ai_call(self) -> None:
        context = _context(range_pct=90, vs_average_pct=27)
        self.assertFalse(_buy_timing_needs_reconsideration(context, _narrative(buy_month="Mar"), "vera"))

    def test_accepts_vera_plan_with_meaningful_annual_capital_use(self) -> None:
        result = _narrative()
        for item in result.monthlyPlan[:4]:
            item.action = "BUY"
            item.buyBudgetPct = 100
        self.assertFalse(_buy_timing_needs_reconsideration(_context(range_pct=90, vs_average_pct=27), result, "vera"))

    def test_rex_keeps_selective_calendar_without_utilization_floor(self) -> None:
        self.assertFalse(_buy_timing_needs_reconsideration(_context(), _narrative(), "rex"))

    def test_ben_reconsiders_repeated_calendar_trims_while_structure_is_open(self) -> None:
        result = _narrative()
        _fund_long_horizon_plan(result)
        for item in result.monthlyPlan[6:8]:
            item.action = "TRIM"
            item.trimPositionPct = 10
        self.assertTrue(_buy_timing_needs_reconsideration(_context(structure="INTACT"), result, "ben"))

    def test_ben_accepts_one_small_defensive_trim(self) -> None:
        result = _narrative()
        _fund_long_horizon_plan(result)
        result.monthlyPlan[6].action = "TRIM"
        result.monthlyPlan[6].trimPositionPct = 10
        self.assertFalse(_buy_timing_needs_reconsideration(_context(structure="INTACT"), result, "ben"))

    def test_ben_reconsiders_oversized_trim_without_at_risk_structure(self) -> None:
        result = _narrative()
        _fund_long_horizon_plan(result)
        result.monthlyPlan[6].action = "TRIM"
        result.monthlyPlan[6].trimPositionPct = 25
        self.assertTrue(_buy_timing_needs_reconsideration(_context(structure="MIXED"), result, "ben"))

    def test_aligned_plan_is_normalized_without_a_second_ai_call(self) -> None:
        initial = _narrative(buy_month="Mar", fit="aligned")
        context = _context()
        context["buyTiming"]["monthlyMap"] = [
            {"month": month, "score": 90 if month == "Sep" else index}
            for index, month in enumerate(MONTHS)
        ]

        with patch("internal.ai.openai_client._run_openai_structured_request", return_value=initial) as request:
            result = analyze_buy_timing_with_openai(context, "vera")

        request.assert_called_once()
        self.assertEqual(result["headline"], "Plan")
        september = next(item for item in result["monthlyPlan"] if item["month"] == "Sep")
        self.assertEqual(september["action"], "BUY")
        self.assertEqual(september["buyBudgetPct"], 100)


if __name__ == "__main__":
    unittest.main()
