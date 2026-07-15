from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.ai.context import _funding_quality_audit, _structural_advantage_audit, build_analysis_context
from internal.ai.openai_client import _align_today_action, _calibrate_prime_hybrid_confidence, _selected_model, _today_action_issue, analyze_today_with_openai
from internal.market.technicals import build_technicals
from models import BuyTimingNarrative, StockAnalysis, TodayPerformance
from pydantic import ValidationError
from fastapi import HTTPException
from routes.analysis import _fetch_analysis_data, _require_ai_market_data


class AiPerformanceTests(unittest.TestCase):
    def test_prime_confidence_blends_ai_with_soft_rule_anchor(self) -> None:
        class Result:
            def __init__(self, confidence: int, tier: str) -> None:
                self.confidence = confidence
                self.tier = tier
                self.longTermView = type("LongTerm", (), {
                    "allocationPlan": type("Allocation", (), {"tier": tier})(),
                })()

            def model_copy(self, *, update: dict) -> "Result":
                return Result(update.get("confidence", self.confidence), self.tier)

        context = {"quantScorecard": {
            "score": 20,
            "componentScores": {
                "businessQuality": 20, "technicalTiming": 20, "swingEntry": 20,
                "relativeStrength": 20, "platformSetup": 20,
            },
        }}

        hybrid = _calibrate_prime_hybrid_confidence(context, Result(80, "BUILD"), "alphawolf")
        specialist = _calibrate_prime_hybrid_confidence(context, Result(80, "BUILD"), "vera")

        self.assertEqual(hybrid.confidence, 61)
        self.assertEqual(specialist.confidence, 80)

    def test_today_profile_skips_heavy_research_sources(self) -> None:
        with (
            patch("routes.analysis.build_detail_bundle", return_value={"stock": {"symbol": "TEST"}}) as bundle_builder,
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
        bundle_builder.assert_called_once_with("TEST", "capitalized", mode=None, refresh_stale=False)
        self.assertEqual((financial_data, market_data, insight_data), ({}, {}, {}))
        financials.assert_not_called()
        market.assert_not_called()
        insights.assert_not_called()

    def test_position_context_reads_saved_holding_without_rebuilding_portfolio(self) -> None:
        holding = SimpleNamespace(
            symbol="SIRI.BK",
            shares=13_500,
            averageCost=0.04,
            monthlyDca=0,
            strategy="capitalized",
            createdAt="2026-07-15T00:00:00+00:00",
        )
        with (
            patch("routes.analysis.list_holdings", return_value=[holding]),
            patch("routes.analysis.build_portfolio_dashboard") as dashboard,
        ):
            from routes.analysis import _position_context
            context = _position_context("SIRI.BK", 7)

        self.assertTrue(context["isHolding"])
        self.assertEqual(context["shares"], 13_500)
        dashboard.assert_not_called()

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
        market = {"points": [{"benchmark": index, "stock": index, "peer": index} for index in range(50)]}
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

    def test_ai_rating_rejects_zero_price_before_model_call(self) -> None:
        bundle = {
            "stock": {"symbol": "XAUUSD", "price": 0},
            "history": [{"date": str(index), "close": 0} for index in range(10)],
        }

        with self.assertRaises(HTTPException) as raised:
            _require_ai_market_data(bundle, "XAUUSD")

        self.assertEqual(raised.exception.status_code, 422)
        self.assertIn("No AI score was generated", raised.exception.detail)

    def test_ai_rating_accepts_positive_price_and_history(self) -> None:
        bundle = {
            "stock": {"symbol": "XAUUSD=X", "price": 2400},
            "history": [{"date": str(index), "close": 2390 + index} for index in range(5)],
        }

        self.assertIsNone(_require_ai_market_data(bundle, "XAUUSD=X"))

    def test_agent_overall_score_rejects_balanced_middle(self) -> None:
        payload = {
            "signal": "WATCH",
            "headline": "No edge",
            "tone": "bad",
            "confidence": 52,
            "summary": "The setup does not clear this Agent's bar.",
            "longTermView": {
                "structureScore": 24,
                "outlookRating": "AVOID",
                "perspectiveSections": [
                    {"title": "Cash quality", "rating": "RISK", "body": "Cash conversion is weak.", "evidence": ["Low operating cash flow"]},
                    {"title": "Funding", "rating": "UNPROVEN", "body": "Funding evidence is limited.", "evidence": ["Debt data unavailable"]},
                    {"title": "Returns", "rating": "RISK", "body": "Returns are weak.", "evidence": ["Low ROE"]},
                    {"title": "Expectations", "rating": "WATCH", "body": "Expectations remain high.", "evidence": ["Premium valuation"]},
                ],
                "outlookHorizon": "3-5 years",
                "outlookTitle": "Intrinsic value & earnings bridge",
                "agentOutlook": "The business is unlikely to compound without improvement.",
                "actionPlan": "Avoid until returns improve.",
                "allocationPlan": {
                    "tier": "STARTER",
                    "plannedPositionPct": 20,
                    "label": "Small proof position",
                    "rationale": "The thesis needs more evidence.",
                    "scaleUpTrigger": "Cash conversion improves.",
                    "cutTrigger": "Debt funding increases.",
                },
                "keySignals": ["Weak execution", "Limited asset evidence"],
                "thesisBreakers": ["Revenue recovers", "Margins recover"],
            },
            "targetPrice": {"currentPrice": 100, "targetPrice": 105, "impliedUpsidePct": 5, "timeHorizon": "12 months", "basis": "Supplied evidence."},
            "entryPrice": {"currentPrice": 100, "entryPrice": 95, "distanceFromCurrentPct": 5, "why": "Wait for the supplied support."},
            "scores": [
                {"label": "Value", "score": 50, "why": "Mixed."},
                {"label": "Financial health", "score": 50, "why": "Mixed."},
                {"label": "Dividend safety", "score": None, "why": "Unavailable."},
                {"label": "Growth", "score": 50, "why": "Mixed."},
                {"label": "Timing", "score": 30, "why": "Weak."},
            ],
            "bullets": ["One", "Two"],
            "dcaTiming": "Wait.",
            "recap": "Pass.",
            "agentFit": "against",
            "agentFitReason": "It does not fit.",
        }

        with self.assertRaises(ValidationError):
            StockAnalysis.model_validate(payload)

        payload["confidence"] = 24
        self.assertEqual(StockAnalysis.model_validate(payload).confidence, 24)

    def test_buy_timing_perspective_rejects_middle_score(self) -> None:
        payload = {
            "headline": "Wait",
            "summary": "Price is outside the entry zone.",
            "action": "WAIT",
            "perspectiveScore": 50,
            "perspectiveReason": "Price is extended.",
            "recap": "Wait.",
            "agentFit": "against",
            "agentFitReason": "I would not buy here.",
        }
        with self.assertRaises(ValidationError):
            BuyTimingNarrative.model_validate(payload)

    def test_allocation_tier_rejects_inconsistent_size(self) -> None:
        from models import StockAnalysisAllocationPlan

        with self.assertRaises(ValidationError):
            StockAnalysisAllocationPlan.model_validate(
                {
                    "tier": "STARTER",
                    "plannedPositionPct": 75,
                    "label": "Too large",
                    "rationale": "Mismatch.",
                    "scaleUpTrigger": "Trigger.",
                    "cutTrigger": "Cut.",
                }
            )

        valid = StockAnalysisAllocationPlan.model_validate(
            {
                "tier": "BUILD",
                "plannedPositionPct": 60,
                "label": "Build in stages",
                "rationale": "Evidence supports meaningful exposure.",
                "scaleUpTrigger": "Final condition passes.",
                "cutTrigger": "Thesis breaks.",
            }
        )
        self.assertEqual(valid.plannedPositionPct, 60)

    def test_technicals_include_stochastic_for_quant_agent(self) -> None:
        closes = [100 + index * 0.6 + (index % 4) for index in range(40)]
        history = pd.DataFrame(
            {
                "Close": closes,
                "High": [value + 2 for value in closes],
                "Low": [value - 2 for value in closes],
                "Volume": [1_000_000 + index * 10_000 for index in range(40)],
            },
            index=pd.date_range("2026-01-01", periods=40, freq="D"),
        )

        technicals = build_technicals(history)

        self.assertIsNotNone(technicals["stochasticK"])
        self.assertIsNotNone(technicals["stochasticD"])
        self.assertIn("trend", technicals["dowTheory"])
        self.assertIn("phase", technicals["wyckoff"])
        self.assertIn("bias", technicals["elliottWave"])
        self.assertEqual(technicals["fibonacci"]["direction"], "UPSWING")
        self.assertIn("127.2", technicals["fibonacci"]["extensions"])
        self.assertIn(technicals["multiTimeframe"]["alignment"], {"BULLISH", "BEARISH", "MIXED"})

    def test_owner_earnings_audit_distinguishes_cash_from_debt(self) -> None:
        financials = {
            "incomeStatement": {"latest": {"Net Income": 100}},
            "cashFlow": {"latest": {"Operating Cash Flow": 160, "Capital Expenditure": -40, "Free Cash Flow": 120}},
            "balanceSheet": {"latest": {"Total Assets": 900, "Total Liabilities": 300, "Total Debt": 80}},
        }

        audit = _funding_quality_audit(financials, {"totalCash": 200})

        self.assertEqual(audit["freeCashFlow"], 120)
        self.assertEqual(audit["netCash"], 120)
        self.assertEqual(audit["operatingCashFlowToNetIncome"], 1.6)
        self.assertTrue(audit["fundingRead"].startswith("SELF_FUNDED"))
        self.assertIn("not spendable budget", audit["guardrail"])

    def test_owner_earnings_audit_flags_debt_funded_risk(self) -> None:
        financials = {
            "incomeStatement": {"latest": {"Net Income": 100}},
            "cashFlow": {"latest": {"Operating Cash Flow": 20, "Capital Expenditure": -60, "Free Cash Flow": -40}},
            "balanceSheet": {"latest": {"Total Debt": 500}},
        }

        audit = _funding_quality_audit(financials, {"totalCash": 25})

        self.assertTrue(audit["fundingRead"].startswith("RISK"))

    def test_structural_advantage_never_invents_monopoly(self) -> None:
        financials = {
            "incomeStatement": {"latest": {"Net Income": 100}},
            "cashFlow": {"latest": {"Operating Cash Flow": 160, "Free Cash Flow": 120}},
            "balanceSheet": {"latest": {"Total Debt": 20}},
        }
        business = {
            "grossMargin": 60,
            "operatingMargin": 30,
            "roe": 25,
            "revenueGrowth": 12,
            "dividendYield": 2.5,
            "payoutRatio": 40,
            "totalCash": 100,
        }

        audit = _structural_advantage_audit(business, financials)

        self.assertEqual(audit["comparativeAdvantageStatus"], "STRONG_PROXY")
        self.assertEqual(audit["dividendQuality"]["status"], "SUPPORTED_PROXY")
        self.assertTrue(audit["monopolyEvidence"].startswith("UNPROVEN"))

    def test_today_plan_contract_is_compact(self) -> None:
        payload = {
            "signal": "TODAY CONFIRMED PLAN",
            "tone": "good",
            "buyScore": 72,
            "headline": "Today held the plan.",
            "summary": "Hold because the owner thesis remains intact.",
            "holdingAction": "HOLD",
            "holdingActionReason": "No thesis breaker occurred today.",
            "todayRead": "One session does not change owner earnings.",
            "horizonAlignment": {
                "status": "ALIGNED",
                "planHorizon": "5 years",
                "structureRead": "The supplied business structure remains intact.",
                "why": "No supplied structural metric broke the plan.",
            },
            "evidence": ["No thesis breaker", "Price remains within the supplied plan"],
            "continueGate": "Continue while owner earnings remain intact.",
            "exitGate": "Exit if the funding or business thesis breaks.",
            "nextCheck": "Check the next reported cash-flow update.",
            "risk": "No overnight data is known.",
            "recap": "Hold the plan.",
            "agentFit": "aligned",
            "agentFitReason": "The setup fits my rule.",
        }

        result = TodayPerformance.model_validate(payload)
        self.assertEqual(result.holdingAction, "HOLD")
        self.assertEqual(result.horizonAlignment.status, "ALIGNED")
        self.assertLessEqual(len(result.evidence), 3)

        reduced = _align_today_action(
            {"positionContext": {"isHolding": True}},
            result.model_copy(update={"buyScore": 34}),
        )
        self.assertEqual(reduced.holdingAction, "REDUCE")
        self.assertEqual(reduced.signal, "REDUCE")
        self.assertEqual(reduced.horizonAlignment.status, "WATCH")
        self.assertEqual(reduced.agentFit, "against")

        sold = _align_today_action(
            {"positionContext": {"isHolding": True}},
            result.model_copy(update={"buyScore": 12}),
        )
        self.assertEqual(sold.holdingAction, "SELL")
        self.assertEqual(sold.horizonAlignment.status, "BROKEN")

        added = _align_today_action(
            {"positionContext": {"isHolding": True}},
            result.model_copy(update={"buyScore": 86}),
        )
        self.assertEqual(added.holdingAction, "ADD_SMALL")
        self.assertEqual(added.horizonAlignment.status, "ALIGNED")

    def test_today_plan_detects_horizon_and_persona_contradictions(self) -> None:
        payload = {
            "signal": "HOLD",
            "tone": "good",
            "buyScore": 72,
            "headline": "Hold the owner plan.",
            "summary": "Daily price noise did not change the owner thesis.",
            "holdingAction": "HOLD",
            "holdingActionReason": "Owner earnings remain intact.",
            "todayRead": "The session is ordinary noise.",
            "horizonAlignment": {
                "status": "BROKEN",
                "planHorizon": "5 years",
                "structureRead": "The structure is intact.",
                "why": "Price fell below SMA50.",
            },
            "evidence": ["Price fell below SMA50", "RSI weakened"],
            "continueGate": "Owner earnings remain intact.",
            "exitGate": "Owner earnings deteriorate.",
            "nextCheck": "Next earnings update.",
            "risk": "Funding could weaken.",
            "recap": "Hold.",
            "agentFit": "aligned",
            "agentFitReason": "This remains an owner holding.",
        }
        result = TodayPerformance.model_validate(payload)
        context = {"positionContext": {"isHolding": True}}

        self.assertIn("BROKEN", _today_action_issue(context, result, "ben") or "")

        technical_exit = result.model_copy(update={
            "buyScore": 34,
            "holdingAction": "REDUCE",
            "horizonAlignment": result.horizonAlignment.model_copy(update={"status": "WATCH"}),
        })
        self.assertIn("technical noise", _today_action_issue(context, technical_exit, "ben") or "")

    def test_today_plan_retries_one_inconsistent_agent_answer(self) -> None:
        base = TodayPerformance.model_validate({
            "signal": "HOLD",
            "tone": "good",
            "buyScore": 72,
            "headline": "Hold the owner plan.",
            "summary": "The owner thesis remains intact.",
            "holdingAction": "HOLD",
            "holdingActionReason": "Owner earnings remain intact.",
            "todayRead": "This session is ordinary noise.",
            "horizonAlignment": {
                "status": "BROKEN",
                "planHorizon": "5 years",
                "structureRead": "The structure remains intact.",
                "why": "Price fell below SMA50.",
            },
            "evidence": ["Owner earnings remain intact", "Price fell below SMA50"],
            "continueGate": "Continue while owner earnings remain intact.",
            "exitGate": "Exit if owner earnings deteriorate.",
            "nextCheck": "Check the next earnings report.",
            "risk": "Funding could weaken.",
            "recap": "Hold.",
            "agentFit": "aligned",
            "agentFitReason": "The owner thesis fits.",
        })
        corrected = base.model_copy(update={
            "horizonAlignment": base.horizonAlignment.model_copy(update={
                "status": "ALIGNED",
                "why": "No supplied owner-economics or funding evidence broke the five-year plan.",
            }),
        })

        with patch("internal.ai.openai_client._run_openai_structured_request", side_effect=[base, corrected]) as run:
            result = analyze_today_with_openai({"positionContext": {"isHolding": True}}, "ben")

        self.assertEqual(run.call_count, 2)
        self.assertIn("consistencyCorrection", run.call_args_list[1].kwargs["context"])
        self.assertEqual(result["holdingAction"], "HOLD")
        self.assertEqual(result["horizonAlignment"]["status"], "ALIGNED")


if __name__ == "__main__":
    unittest.main()
