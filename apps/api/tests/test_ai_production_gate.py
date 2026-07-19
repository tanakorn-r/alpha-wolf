from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.ai.production_gate import attach_run_context, build_decision_state, enforce_production_gate
from internal.market.buy_timing import MONTHS, _backtest_monthly_plan
from internal.store import db as store_db
from internal.store.ai_results import AIResultKey, save_ai_result


def _context(*, price: float = 95, resistance: float = 100, archetype: str = "GROWTH_TECH") -> dict:
    return {
        "stock": {"symbol": "TEST", "price": price},
        "technicals": {"support": 90, "resistance": resistance, "volumeRatio": 0.6},
        "business": {"roe": 12, "profitMargin": 15, "revenueGrowth": 8},
        "companyStructureProfile": {
            "archetype": archetype,
            "primaryMetrics": ["revenue durability", "gross margin", "free-cash-flow margin"],
        },
    }


def _base(agent: str = "vera") -> dict:
    return {
        "signal": "WAIT", "headline": "Wait", "summary": "Evidence-based answer",
        "source": "openai", "model": "gpt-test", "agent": {"id": agent},
        "generatedAt": "2026-07-15T00:00:00+00:00",
    }


class AIProductionGateTests(unittest.TestCase):
    def test_shared_state_flags_but_does_not_rewrite_agent_judgment(self) -> None:
        payload = attach_run_context(
        {**_base("kai"), "verdict": "CHASING", "rightNow": {"action": "AVOID"},
         "summary": "Volume is low below resistance; wait for a breakout and use a stop."},
        feature="valuation", context=_context(), data_trust={"marketTimestamp": "2026-07-14T20:00:00Z"},
        )
        guarded, checks = enforce_production_gate("valuation", "kai", payload)
        self.assertEqual(guarded["verdict"], "CHASING")
        self.assertEqual(guarded["rightNow"]["action"], "AVOID")
        self.assertEqual(guarded["guardedDecision"]["stateId"], guarded["decisionState"]["id"])
        consistency = next(item for item in checks if item["name"] == "shared_state_consistency")
        self.assertFalse(consistency["passed"])


    def test_tactical_evidence_preference_is_diagnostic(self) -> None:
        payload = attach_run_context(_base("rex"), feature="stock-analysis", context=_context())
        _, checks = enforce_production_gate("stock-analysis", "rex", payload)
        tactical = next(item for item in checks if item["name"] == "tactical_evidence")
        self.assertFalse(tactical["passed"])


    def test_nadia_sizing_preference_is_diagnostic(self) -> None:
        plan = [{"month": str(index), "action": "BUY", "buyBudgetPct": 100} for index in range(12)]
        payload = attach_run_context(
        {**_base("nadia"), "summary": "Risk exposure and drawdown edge", "agentMonthlyPlan": plan},
        feature="buy-timing", context=_context(),
    )
        _, checks = enforce_production_gate("buy-timing", "nadia", payload)
        behavior = next(item for item in checks if item["name"] == "persona_plan_behavior")
        self.assertFalse(behavior["passed"])

    def test_patient_owner_can_publish_a_selective_calendar(self) -> None:
        plan = [{"month": str(index), "action": "HOLD", "buyBudgetPct": 0} for index in range(12)]
        plan[8] = {"month": "Sep", "action": "ADD_SMALL", "buyBudgetPct": 25}
        payload = attach_run_context(
            {**_base("ben"), "agentMonthlyPlan": plan},
            feature="buy-timing", context=_context(),
        )
        guarded, checks = enforce_production_gate("buy-timing", "ben", payload)
        self.assertEqual(guarded["agentMonthlyPlan"][8]["buyBudgetPct"], 25)
        self.assertTrue(any(item["name"] == "persona_plan_behavior" for item in checks))

    def test_owner_participation_preference_is_diagnostic(self) -> None:
        plan = [{"month": str(index), "action": "HOLD", "buyBudgetPct": 0} for index in range(12)]
        payload = attach_run_context(
            {**_base("ben"), "agentMonthlyPlan": plan},
            feature="buy-timing", context=_context(),
        )
        _, checks = enforce_production_gate("buy-timing", "ben", payload)
        behavior = next(item for item in checks if item["name"] == "persona_plan_behavior")
        self.assertFalse(behavior["passed"])


    def test_prime_cannot_promise_to_always_win(self) -> None:
        payload = attach_run_context(
        {**_base("alphawolf"), "summary": "This method will always win."},
        feature="stock-analysis", context=_context(),
    )
        with self.assertRaisesRegex(ValueError, "prohibited"):
            enforce_production_gate("stock-analysis", "alphawolf", payload)

    def test_prime_evidence_blend_preference_is_diagnostic(self) -> None:
        payload = attach_run_context(
            {**_base("alphawolf"), "summary": "The price looks interesting."},
            feature="stock-analysis", context=_context(),
        )
        _, checks = enforce_production_gate("stock-analysis", "alphawolf", payload)
        blend = next(item for item in checks if item["name"] == "hybrid_evidence_blend")
        self.assertFalse(blend["passed"])


    def test_sector_native_requirements_and_full_run_audit_are_persisted(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir, patch.object(store_db, "DB_PATH", Path(tempdir) / "audit.sqlite3"), patch.object(store_db, "DATABASE_URL", None):
            store_db.migrate()
            payload = attach_run_context(_base("vera"), feature="stock-analysis", context=_context(archetype="BANK"), data_trust={"provider": "Yahoo Finance", "marketTimestamp": "2026-07-14T20:00:00Z"})
            result = save_ai_result(AIResultKey(1, "stock-analysis", "TEST", "vera", "v1"), payload)
            self.assertTrue(result["runId"])
            self.assertEqual(result["decisionState"]["sectorEvidence"]["archetype"], "BANK")
            with store_db.connect() as db:
                row = db.execute("SELECT model,prompt_version,source_timestamps,input_payload,guarded_output,status FROM ai_run_audit").fetchone()
            self.assertEqual(row[0], "gpt-test")
            self.assertEqual(row[1], "stock-analysis/production-v1")
            self.assertEqual(json.loads(row[2])["marketTimestamp"], "2026-07-14T20:00:00Z")
            self.assertEqual(json.loads(row[3])["stock"]["symbol"], "TEST")
            self.assertEqual(json.loads(row[4])["guardedDecision"]["ownership"], "PARTICIPATE")
            self.assertEqual(row[5], "accepted")


    def test_decision_state_separates_ownership_from_tactical_timing(self) -> None:
        state = build_decision_state(_context())
        self.assertEqual(state["ownership"], "PARTICIPATE")
        self.assertEqual(state["timing"], "BUILDING")

    def test_in_sample_replay_cannot_publish_a_skill_claim(self) -> None:
        history = [
            {"date": f"2025-{index + 1:02d}-28", "month": MONTHS[index], "close": 100 + index}
            for index in range(12)
        ] + [{"date": "2026-01-28", "month": "Jan", "close": 113}]
        plan = [{"month": month, "action": "BUY", "buyBudgetPct": 100} for month in MONTHS]
        result = _backtest_monthly_plan(history, plan, "ben")
        self.assertIsNotNone(result)
        self.assertTrue(result["inSample"])
        self.assertFalse(result["historicalClaimEligible"])
        self.assertEqual(result["validation"]["status"], "NOT_VALIDATED")


if __name__ == "__main__":
    unittest.main()
