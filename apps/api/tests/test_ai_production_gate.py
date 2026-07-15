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
    def test_shared_state_repairs_building_chase_contradiction(self) -> None:
        payload = attach_run_context(
        {**_base("kai"), "verdict": "CHASING", "rightNow": {"action": "AVOID"},
         "summary": "Volume is low below resistance; wait for a breakout and use a stop."},
        feature="valuation", context=_context(), data_trust={"marketTimestamp": "2026-07-14T20:00:00Z"},
    )
        guarded, checks = enforce_production_gate("valuation", "kai", payload)
        self.assertEqual(guarded["verdict"], "BUILDING")
        self.assertEqual(guarded["rightNow"]["action"], "WAIT")
        self.assertEqual(guarded["guardedDecision"]["stateId"], guarded["decisionState"]["id"])
        self.assertTrue(any(item.get("repaired") for item in checks))


    def test_tactical_agent_cannot_publish_generic_valuation_language(self) -> None:
        payload = attach_run_context(_base("rex"), feature="stock-analysis", context=_context())
        with self.assertRaisesRegex(ValueError, "tactical Agent"):
            enforce_production_gate("stock-analysis", "rex", payload)


    def test_nadia_cannot_publish_all_or_nothing_calendar(self) -> None:
        plan = [{"month": str(index), "action": "BUY", "buyBudgetPct": 100} for index in range(12)]
        payload = attach_run_context(
        {**_base("nadia"), "summary": "Risk exposure and drawdown edge", "agentMonthlyPlan": plan},
        feature="buy-timing", context=_context(),
    )
        with self.assertRaisesRegex(ValueError, "all-or-nothing"):
            enforce_production_gate("buy-timing", "nadia", payload)


    def test_prime_cannot_promise_to_always_win(self) -> None:
        payload = attach_run_context(
        {**_base("alphawolf"), "summary": "This method will always win."},
        feature="stock-analysis", context=_context(),
    )
        with self.assertRaisesRegex(ValueError, "prohibited"):
            enforce_production_gate("stock-analysis", "alphawolf", payload)

    def test_prime_must_actually_blend_evidence(self) -> None:
        payload = attach_run_context(
            {**_base("alphawolf"), "summary": "The price looks interesting."},
            feature="stock-analysis", context=_context(),
        )
        with self.assertRaisesRegex(ValueError, "three independent"):
            enforce_production_gate("stock-analysis", "alphawolf", payload)


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
