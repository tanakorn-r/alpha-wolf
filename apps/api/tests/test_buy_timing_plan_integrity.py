from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.ai import openai_client
from internal.ai.openai_client import _buy_timing_needs_reconsideration, _normalize_buy_timing_contract, analyze_buy_timing_with_openai
from internal.store import cache
from internal.market.buy_timing import build_agent_evidence
from models import BuyTimingNarrative


MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _narrative(*, action: str = "WAIT", score: int = 34, buy_month: str | None = None, fit: str = "neutral") -> BuyTimingNarrative:
    return BuyTimingNarrative.model_validate({
        "headline": "Plan",
        "summary": "Summary",
        "strategyQuote": "For this stock, I will follow my plan and size only when my evidence clears.",
        "action": action,
        "perspectiveScore": score,
        "perspectiveReason": "Reason",
        "coreBelief": "Own durable evidence, not calendar noise.",
        "evidencePriority": "Start with the evidence this persona trusts most.",
        "fitExplanation": "The supplied company evidence partially fits the method.",
        "thesisBreaker": "The controlling evidence deteriorates.",
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
    def test_tactical_wait_cannot_buy_in_current_month(self) -> None:
        context = _context(structure="MIXED")
        context["buyTiming"]["monthlyMap"] = [
            {"month": month, "score": index, "action": "BUY", "note": "evidence", "isCurrent": month == "Jul"}
            for index, month in enumerate(MONTHS)
        ]
        result = _narrative(action="WAIT", buy_month="Jul")

        for agent in ("rex", "kai"):
            plan = _normalize_buy_timing_contract(context, result, agent).monthlyPlan
            july = next(item for item in plan if item.month == "Jul")

            self.assertEqual(july.action, "HOLD", agent)
            self.assertEqual(july.buyBudgetPct, 0, agent)

    def test_strategic_wait_preserves_the_current_routine_contribution(self) -> None:
        context = _context(structure="MIXED")
        context["buyTiming"]["monthlyMap"] = [
            {"month": month, "score": index, "action": "BUY", "note": "evidence", "isCurrent": month == "Jul"}
            for index, month in enumerate(MONTHS)
        ]
        result = _narrative(action="WAIT", buy_month="Jul")

        for agent in ("vera", "ben", "sam", "nadia", "alphawolf"):
            plan = _normalize_buy_timing_contract(context, result, agent).monthlyPlan
            july = next(item for item in plan if item.month == "Jul")

            self.assertIn(july.action, {"BUY", "ADD_SMALL"}, agent)
            self.assertGreater(july.buyBudgetPct, 0, agent)

    def test_today_buy_requires_current_month_funding(self) -> None:
        context = _context(structure="MIXED")
        context["buyTiming"]["monthlyMap"] = [
            {"month": month, "score": index, "action": "HOLD", "note": "evidence", "isCurrent": month == "Jul"}
            for index, month in enumerate(MONTHS)
        ]

        plan = _normalize_buy_timing_contract(context, _narrative(action="BUY"), "vera").monthlyPlan
        july = next(item for item in plan if item.month == "Jul")

        self.assertEqual(july.action, "ADD_SMALL")
        self.assertEqual(july.buyBudgetPct, 25)

    def test_avoid_clears_scheduled_buys(self) -> None:
        result = _narrative(action="AVOID", score=20, buy_month="Nov", fit="against")

        plan = _normalize_buy_timing_contract(_context(), result, "vera").monthlyPlan

        self.assertFalse(any(item.action in {"BUY", "ADD_SMALL"} for item in plan))

    def test_vera_keeps_partial_participation_in_bull_regime(self) -> None:
        context = _context(structure="MIXED")
        context["buyTiming"]["participationContext"] = {"regime": "BULL"}
        context["buyTiming"]["monthlyMap"] = [
            {"month": month, "score": index, "action": "HOLD", "note": "ranked evidence"}
            for index, month in enumerate(MONTHS)
        ]

        plan = _normalize_buy_timing_contract(context, _narrative(), "vera").monthlyPlan

        self.assertEqual(sum(item.buyBudgetPct for item in plan), 75)
        self.assertTrue(all(item.buyBudgetPct <= 50 for item in plan))
        self.assertFalse(any(item.action in {"TRIM", "SELL"} for item in plan))

    def test_nadia_uses_normal_dca_when_timing_edge_is_not_robust(self) -> None:
        context = _context(structure="MIXED")
        context["buyTiming"]["stats"] = {"edgeVsRandomBuyPct": -0.06, "cyclesTested": 9}
        context["buyTiming"]["postExDipPattern"] = {"sampleSize": 9, "hitRate": 66.7}
        context["buyTiming"]["monthlyMap"] = [
            {"month": month, "score": index, "action": "HOLD", "note": "thin evidence", "isCurrent": month == "Jul"}
            for index, month in enumerate(MONTHS)
        ]

        plan = _normalize_buy_timing_contract(context, _narrative(action="BUY", score=31), "nadia").monthlyPlan

        self.assertEqual(sum(item.buyBudgetPct for item in plan), 600)
        self.assertEqual([item.buyBudgetPct for item in plan].count(75), 4)
        self.assertEqual([item.buyBudgetPct for item in plan].count(50), 4)
        self.assertEqual([item.buyBudgetPct for item in plan].count(25), 4)
        self.assertEqual([item.buyBudgetPct for item in plan].count(0), 0)
        self.assertFalse(any(item.action in {"TRIM", "SELL"} for item in plan))
        self.assertIn("Quant fallback after uniform output", plan[-1].reason)

    def test_nadia_wait_preserves_benchmark_dca_including_current_month(self) -> None:
        context = _context(structure="MIXED")
        context["buyTiming"]["stats"] = {"edgeVsRandomBuyPct": 0.1, "cyclesTested": 6}
        context["buyTiming"]["postExDipPattern"] = {"sampleSize": 6, "hitRate": 50}
        context["buyTiming"]["monthlyMap"] = [
            {"month": month, "score": index, "action": "HOLD", "note": "thin evidence", "isCurrent": month == "Jul"}
            for index, month in enumerate(MONTHS)
        ]

        plan = _normalize_buy_timing_contract(context, _narrative(action="WAIT", score=31), "nadia").monthlyPlan
        july = next(item for item in plan if item.month == "Jul")

        self.assertIn(july.action, {"BUY", "ADD_SMALL"})
        self.assertGreater(july.buyBudgetPct, 0)
        self.assertEqual(sum(item.buyBudgetPct for item in plan), 600)

    def test_nadia_uses_core_and_tilt_only_for_robust_positive_edge(self) -> None:
        context = _context(structure="MIXED")
        context["buyTiming"]["stats"] = {"edgeVsRandomBuyPct": 1.4, "cyclesTested": 18}
        context["buyTiming"]["postExDipPattern"] = {"sampleSize": 18, "hitRate": 66.7}
        context["buyTiming"]["monthlyMap"] = [
            {"month": month, "score": index, "action": "BUY", "note": "ranked edge"}
            for index, month in enumerate(MONTHS)
        ]

        plan = _normalize_buy_timing_contract(context, _narrative(action="BUY", score=70, fit="aligned"), "nadia").monthlyPlan
        budgets = [item.buyBudgetPct for item in plan]

        self.assertEqual(budgets.count(100), 4)
        self.assertEqual(budgets.count(75), 4)
        self.assertEqual(budgets.count(25), 4)
        self.assertEqual(budgets.count(0), 0)
        self.assertTrue(all("Quant fallback after uniform output" in item.reason for item in plan if item.buyBudgetPct))

    def test_nadia_preserves_a_coherent_nonuniform_plan(self) -> None:
        narrative = _narrative(action="WAIT", score=31, buy_month="Oct")
        narrative.monthlyPlan[2].action = "TRIM"
        narrative.monthlyPlan[2].trimPositionPct = 25
        before = [(item.action, item.buyBudgetPct, item.trimPositionPct) for item in narrative.monthlyPlan]

        plan = _normalize_buy_timing_contract(_context(), narrative, "nadia").monthlyPlan

        self.assertEqual([(item.action, item.buyBudgetPct, item.trimPositionPct) for item in plan], before)

    def test_kai_preserves_the_chosen_entry_and_adds_only_a_missing_exit(self) -> None:
        context = _context(structure="MIXED")
        monthly_returns = [-7.7, -4.1, -4.4, 0.3, -1.9, 3.5, 9.3, -0.2, -0.9, -1.2, -0.7, 1.6]
        context["buyTiming"]["monthlyMap"] = [
            {
                "month": month,
                "score": 0,
                "action": "BUY",
                "note": "seasonal rank",
                "returnPct": monthly_returns[index],
                "isCurrent": month == "Jul",
            }
            for index, month in enumerate(MONTHS)
        ]

        plan = _normalize_buy_timing_contract(
            context,
            _narrative(action="WAIT", score=70, buy_month="Oct", fit="aligned"),
            "kai",
        ).monthlyPlan
        october = next(item for item in plan if item.month == "Oct")
        december = next(item for item in plan if item.month == "Dec")

        self.assertEqual(october.action, "BUY")
        self.assertEqual(october.buyBudgetPct, 50)
        self.assertEqual(december.action, "SELL")
        self.assertIn("Tactical safety fallback", december.reason)
        self.assertEqual(sum(item.buyBudgetPct for item in plan), 50)

    def test_kai_exits_after_consecutive_entry_cluster(self) -> None:
        narrative = _narrative(action="BUY", score=70, buy_month="Oct", fit="aligned")
        november = narrative.monthlyPlan[10]
        november.action = "ADD_SMALL"
        november.buyBudgetPct = 25

        plan = _normalize_buy_timing_contract(_context(), narrative, "kai").monthlyPlan
        december = next(item for item in plan if item.month == "Dec")

        self.assertEqual(december.action, "SELL")
        self.assertEqual(december.trimPositionPct, 100)

    def test_rex_trims_after_swing_entry_cluster(self) -> None:
        plan = _normalize_buy_timing_contract(
            _context(),
            _narrative(action="BUY", score=70, buy_month="Apr", fit="aligned"),
            "rex",
        ).monthlyPlan
        may = next(item for item in plan if item.month == "May")

        self.assertEqual(may.action, "TRIM")
        self.assertEqual(may.trimPositionPct, 50)
        self.assertIn("Tactical safety fallback", may.reason)

    def test_rex_preserves_a_coherent_swing_path(self) -> None:
        narrative = _narrative(action="BUY", score=70, buy_month="Apr", fit="aligned")
        narrative.monthlyPlan[5].action = "TRIM"
        narrative.monthlyPlan[5].trimPositionPct = 35
        narrative.monthlyPlan[6].action = "SELL"
        narrative.monthlyPlan[6].trimPositionPct = 100

        plan = _normalize_buy_timing_contract(_context(), narrative, "rex").monthlyPlan
        april = next(item for item in plan if item.month == "Apr")
        june = next(item for item in plan if item.month == "Jun")
        july = next(item for item in plan if item.month == "Jul")

        self.assertEqual(april.action, "BUY")
        self.assertEqual(april.buyBudgetPct, 50)
        self.assertEqual(june.action, "TRIM")
        self.assertEqual(june.trimPositionPct, 35)
        self.assertEqual(july.action, "SELL")

    def test_bull_participation_floor_does_not_override_rejection(self) -> None:
        context = _context(structure="MIXED")
        context["buyTiming"]["participationContext"] = {"regime": "BULL"}
        context["buyTiming"]["monthlyMap"] = [
            {"month": month, "score": index, "action": "HOLD", "note": "ranked evidence"}
            for index, month in enumerate(MONTHS)
        ]

        plan = _normalize_buy_timing_contract(context, _narrative(action="AVOID", score=20, fit="against"), "vera").monthlyPlan

        self.assertEqual(sum(item.buyBudgetPct for item in plan), 0)

    def test_each_agent_receives_character_specific_sources(self) -> None:
        snapshot = {
            "currency": "THB",
            "price": 1.47,
            "entryBand": {"low": 1.39, "high": 1.43},
            "priceContext": {"currentPct": 46.2},
            "postExDipPattern": {"averageDipPct": -3.2, "hitRate": 66.7, "sampleSize": 9},
            "stats": {"edgeVsRandomBuyPct": -0.06},
            "backtest": {"strategyReturnPct": 8, "alwaysBuyReturnPct": 7, "totalContributed": 6000, "endingValue": 6480},
            "technicalContext": {"stop": 1.38, "target": 1.49},
            "_sourceSnapshots": {
                "business": {"roe": 8.7, "dividendYield": 4.2, "freeCashflow": 1000000},
                "technicals": {"rsi14": 55, "volumeRatio": 1.4},
                "performance": {"momentumScore": 61, "returns": {"ytd": 5, "1y": 9}},
                "news": [{"title": "Stored catalyst"}],
            },
        }
        expected_first_sources = {
            "vera": "Company financial profile",
            "ben": "Company financial profile",
            "sam": "Dividend + company fundamentals",
            "rex": "Price/volume technicals",
            "kai": "Recent stored market news",
            "nadia": "Dividend-event backtest",
            "alphawolf": "Rule engine · industry-normalized company evidence",
        }
        profiles = {agent: build_agent_evidence(snapshot, agent) for agent in expected_first_sources}
        for agent, expected_source in expected_first_sources.items():
            self.assertEqual(profiles[agent]["sections"][0]["source"], expected_source)
            self.assertEqual(len(profiles[agent]["sections"]), 4)
        self.assertNotEqual(profiles["nadia"]["sections"], profiles["rex"]["sections"])
        self.assertNotEqual(profiles["sam"]["sections"], profiles["ben"]["sections"])
        prime_sources = [section["source"] for section in profiles["alphawolf"]["sections"]]
        self.assertEqual(prime_sources, [
            "Rule engine · industry-normalized company evidence",
            "Valuation, structural peers + income evidence",
            "Tape, catalysts + measured timing evidence",
            "Risk engine, trade levels + DCA comparison",
        ])

    def test_prompt_requires_actual_numbers_and_explicit_thresholds(self) -> None:
        instructions = openai_client._buy_timing_instructions()
        self.assertIn("NUMERIC CLARITY IS MANDATORY FOR EVERY AGENT", instructions)
        self.assertIn("number unavailable", instructions)
        self.assertIn("actual values with your numeric gates", instructions)
        self.assertIn("companyStructureProfile.seasonalityRule", instructions)
        self.assertIn("hospitality/restaurant operator", instructions)
        self.assertIn("Nadia treats DCA as the", instructions)
        self.assertIn("rules inform the decision", openai_client.compose_instructions("Test", "vera"))
        self.assertIn("Rex and Kai plans should describe a complete trade lifecycle", instructions)
        self.assertIn("evaluate BUY and SELL together as one fast-trade path", instructions)
        self.assertIn("For Rex's monthly candidate map", instructions)
        self.assertIn("EACH AGENT HAS A DIFFERENT BATTLEFIELD", instructions)
        self.assertIn("strategyQuote is the standalone first-person quote", instructions)
        self.assertIn("complete OVERALL strategy", instructions)
        self.assertIn("resistance level cannot be the whole rule", instructions)
        self.assertIn("Price resistance alone is insufficient for strategic owners", instructions)
        self.assertIn("must remain full-plan policies", instructions)
        self.assertIn("WAIT means do not make an extra discretionary lump-sum", instructions)
        self.assertIn("automatically cancel this month's normal strategic DCA", instructions)
        self.assertIn("ownershipEligible", instructions)
        self.assertIn("risk-adjusted efficiency", instructions)
        backtrade = openai_client._backtrade_instructions()
        self.assertIn("soft reference points, not automatic orders", backtrade)
        self.assertIn("not a quota", backtrade)

    def test_aligned_plan_accepts_partial_sizing_without_a_full_month(self) -> None:
        result = _narrative(buy_month="Mar", fit="aligned")
        self.assertFalse(_buy_timing_needs_reconsideration(_context(), result, "sam"))

    def test_agent_may_override_the_top_supplied_calendar_month(self) -> None:
        context = _context()
        context["buyTiming"]["monthlyMap"] = [
            {"month": month, "score": 90 if month == "Sep" else index}
            for index, month in enumerate(MONTHS)
        ]
        result = _narrative(buy_month="Mar", fit="aligned")
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

    def test_ben_reconsiders_only_repeated_calendar_based_trims(self) -> None:
        result = _narrative()
        _fund_long_horizon_plan(result)
        for item in result.monthlyPlan[6:8]:
            item.action = "TRIM"
            item.trimPositionPct = 10
            item.reason = "Seasonal calendar month is historically weak."
        self.assertTrue(_buy_timing_needs_reconsideration(_context(structure="INTACT"), result, "ben"))

    def test_ben_rejects_even_one_calendar_only_trim(self) -> None:
        result = _narrative()
        _fund_long_horizon_plan(result)
        result.monthlyPlan[6].action = "TRIM"
        result.monthlyPlan[6].trimPositionPct = 10
        result.monthlyPlan[6].reason = "Seasonal month risk."
        self.assertTrue(_buy_timing_needs_reconsideration(_context(structure="INTACT"), result, "ben"))

        normalized = _normalize_buy_timing_contract(_context(structure="INTACT"), result, "ben").monthlyPlan
        july = next(item for item in normalized if item.month == "Jul")
        self.assertEqual(july.action, "HOLD")
        self.assertEqual(july.trimPositionPct, 0)

    def test_ben_may_make_a_larger_company_specific_trim(self) -> None:
        result = _narrative()
        _fund_long_horizon_plan(result)
        result.monthlyPlan[6].action = "TRIM"
        result.monthlyPlan[6].trimPositionPct = 25
        result.monthlyPlan[6].reason = "Owner economics weakened and portfolio concentration is excessive."
        self.assertFalse(_buy_timing_needs_reconsideration(_context(structure="MIXED"), result, "ben"))

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
        march = next(item for item in result["monthlyPlan"] if item["month"] == "Mar")
        september = next(item for item in result["monthlyPlan"] if item["month"] == "Sep")
        self.assertEqual(march["action"], "BUY")
        self.assertEqual(march["buyBudgetPct"], 50)
        self.assertEqual(september["action"], "HOLD")

    def test_same_evidence_preserves_each_coherent_agent_judgment(self) -> None:
        context = _context(structure="INTACT")
        context["buyTiming"]["monthlyMap"] = [
            {
                "month": month,
                "score": {"Apr": 47, "Oct": 43, "May": 22}.get(month, -10),
                "action": "BUY" if month in {"Apr", "May", "Oct"} else "HOLD",
                "note": "stored evidence",
            }
            for month in MONTHS
        ]
        local = _narrative(buy_month="Sep", fit="aligned")
        production = _narrative(buy_month="Oct", fit="aligned")
        production.monthlyPlan[9].buyBudgetPct = 25

        local_plan = _normalize_buy_timing_contract(context, local, "vera").monthlyPlan
        production_plan = _normalize_buy_timing_contract(context, production, "vera").monthlyPlan
        local_calendar = [(item.month, item.action, item.buyBudgetPct) for item in local_plan]
        production_calendar = [(item.month, item.action, item.buyBudgetPct) for item in production_plan]

        self.assertNotEqual(local_calendar, production_calendar)
        self.assertEqual(
            [(item.month, item.buyBudgetPct) for item in local_plan if item.buyBudgetPct],
            [("Sep", 50)],
        )
        self.assertEqual(
            [(item.month, item.buyBudgetPct) for item in production_plan if item.buyBudgetPct],
            [("Oct", 25)],
        )

    def test_aligned_ben_gets_only_a_modest_fallback_when_model_buys_nothing(self) -> None:
        context = _context(structure="INTACT")
        context["buyTiming"]["monthlyMap"] = [
            {"month": month, "score": index, "action": "BUY", "note": "stored evidence"}
            for index, month in enumerate(MONTHS)
        ]

        plan = _normalize_buy_timing_contract(context, _narrative(fit="aligned"), "ben").monthlyPlan

        self.assertEqual([item.buyBudgetPct for item in plan].count(50), 1)
        self.assertEqual([item.buyBudgetPct for item in plan].count(25), 2)
        self.assertEqual([item.buyBudgetPct for item in plan].count(0), 9)
        self.assertFalse(any(item.action in {"TRIM", "SELL"} for item in plan))

    def test_owner_bull_fallback_prevents_pathological_cash_drag(self) -> None:
        context = _context(structure="MIXED")
        context["buyTiming"]["businessStructure"]["ownershipEligible"] = True
        context["buyTiming"]["participationContext"] = {"regime": "BULL"}
        context["buyTiming"]["monthlyMap"] = [
            {"month": month, "score": index, "action": "BUY", "note": "ranked evidence"}
            for index, month in enumerate(MONTHS)
        ]

        plan = _normalize_buy_timing_contract(context, _narrative(fit="aligned"), "ben").monthlyPlan

        self.assertEqual(sum(item.buyBudgetPct for item in plan), 1100)
        self.assertEqual([item.buyBudgetPct for item in plan].count(100), 8)
        self.assertEqual([item.buyBudgetPct for item in plan].count(75), 4)
        self.assertEqual([item.buyBudgetPct for item in plan].count(0), 0)

    def test_one_token_owner_buy_does_not_bypass_bull_participation_floor(self) -> None:
        context = _context(structure="MIXED")
        context["buyTiming"]["businessStructure"]["ownershipEligible"] = True
        context["buyTiming"]["participationContext"] = {"regime": "BULL"}
        context["buyTiming"]["monthlyMap"] = [
            {"month": month, "score": index, "action": "BUY", "note": "ranked evidence"}
            for index, month in enumerate(MONTHS)
        ]
        narrative = _narrative(score=68, buy_month="Nov", fit="neutral")
        narrative.monthlyPlan[10].buyBudgetPct = 25

        normalized = _normalize_buy_timing_contract(context, narrative, "ben")
        plan = normalized.monthlyPlan

        self.assertEqual(sum(item.buyBudgetPct for item in plan), 1100)
        self.assertGreaterEqual(sum(1 for item in plan if item.buyBudgetPct > 0), 11)
        self.assertIn("own this stock for the long term", normalized.strategyQuote)
        self.assertNotIn("envelope", normalized.strategyQuote)

    def test_owner_trim_call_keeps_future_compounding_core(self) -> None:
        context = _context(structure="MIXED")
        context["buyTiming"]["businessStructure"]["ownershipEligible"] = True
        context["buyTiming"]["participationContext"] = {"regime": "BULL"}
        context["buyTiming"]["monthlyMap"] = [
            {"month": month, "score": index, "action": "HOLD", "note": "ranked evidence", "isCurrent": month == "Jul"}
            for index, month in enumerate(MONTHS)
        ]
        narrative = _narrative(action="TRIM", score=68, fit="neutral")
        narrative.monthlyPlan[6].action = "TRIM"
        narrative.monthlyPlan[6].trimPositionPct = 10
        narrative.monthlyPlan[6].reason = "Valuation is stretched relative to supplied owner value."

        plan = _normalize_buy_timing_contract(context, narrative, "ben").monthlyPlan
        july = next(item for item in plan if item.month == "Jul")

        self.assertEqual(july.action, "TRIM")
        self.assertEqual(july.trimPositionPct, 10)
        self.assertEqual(sum(item.buyBudgetPct for item in plan), 1100)
        self.assertEqual(sum(1 for item in plan if item.buyBudgetPct > 0), 11)


if __name__ == "__main__":
    unittest.main()
