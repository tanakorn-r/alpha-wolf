from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.ai.backtrade import _dividend_context, _equity_point, _event_indices, _financial_as_of, _max_drawdown, _normalize_decision, _snapshot


class BacktradeTests(unittest.TestCase):
    def setUp(self) -> None:
        index = pd.bdate_range("2024-01-01", periods=320)
        values = [100 + step * 0.1 for step in range(320)]
        self.frame = pd.DataFrame({"Open": values, "Close": values, "Volume": [1_000] * 320}, index=index)

    def test_snapshot_cannot_see_prices_after_replay_date(self) -> None:
        snapshot = _snapshot(self.frame, 250, 100, 2, 500, agent_id="rex")

        self.assertEqual(snapshot["date"], self.frame.index[250].date().isoformat())
        self.assertAlmostEqual(snapshot["signalEvidence"]["price"], self.frame.iloc[250]["Close"])
        self.assertNotEqual(snapshot["signalEvidence"]["price"], self.frame.iloc[-1]["Close"])

    def test_ben_receives_all_desks_with_analyst_priority(self) -> None:
        timeline = [{"periodEnd": "2024-03-31", "availableFrom": "2024-05-30", "operatingCashFlow": 20, "freeCashFlow": 15, "netIncome": 10, "equity": 100, "totalDebt": 20, "cash": 30, "revenue": 80}]
        snapshot = _snapshot(self.frame, 250, 100, 2, 500, 100, "ben", timeline)

        self.assertEqual(snapshot["analystEvidence"]["kind"], "reported_structure")
        self.assertEqual(snapshot["analystEvidence"]["thesisStatus"], "INTACT")
        self.assertEqual(snapshot["agentDecisionOrder"][0], "ANALYST")
        self.assertEqual(snapshot["deploymentPolicy"]["normalInstallmentPct"], 25)
        self.assertEqual(snapshot["deploymentPolicy"]["style"], "recurring_owner")
        self.assertIn("sma20", str(snapshot).lower())

    def test_tactical_agent_is_not_forced_into_monthly_dca(self) -> None:
        snapshot = _snapshot(self.frame, 250, 100, 2, 500, 100, "rex", [])

        self.assertEqual(snapshot["deploymentPolicy"]["style"], "tactical")
        self.assertEqual(snapshot["deploymentPolicy"]["normalInstallmentPct"], 0)

    def test_financial_statement_respects_reporting_lag(self) -> None:
        timeline = [{"periodEnd": "2024-03-31", "availableFrom": "2024-05-30", "operatingCashFlow": 20, "freeCashFlow": 15, "netIncome": 10, "equity": 100, "totalDebt": 20, "cash": 30, "revenue": 80}]

        self.assertEqual(_financial_as_of(timeline, pd.Timestamp("2024-05-29"))["coverage"], "UNAVAILABLE")
        self.assertEqual(_financial_as_of(timeline, pd.Timestamp("2024-05-30"))["coverage"], "AVAILABLE")

    def test_monthly_mode_emits_month_end_decisions_only(self) -> None:
        events = _event_indices(self.frame, 200, "monthly")

        self.assertTrue(events)
        self.assertTrue(all(self.frame.index[index].month != self.frame.index[index + 1].month for index in events))

    def test_decision_normalization_prevents_impossible_orders(self) -> None:
        buy_without_cash = _normalize_decision({"action": "BUY", "buyCashPct": 80, "conviction": 70}, 0, 10)
        trim_without_shares = _normalize_decision({"action": "TRIM", "trimPositionPct": 25, "conviction": 70}, 100, 0)

        self.assertEqual(buy_without_cash["action"], "HOLD")
        self.assertEqual(trim_without_shares["action"], "HOLD")

    def test_normalization_does_not_rewrite_agent_hold(self) -> None:
        snapshot = {"analystEvidence": {"kind": "reported_structure", "thesisStatus": "INTACT"}, "portfolio": {"nextMonthlyContribution": 100}}

        decision = _normalize_decision({"action": "HOLD", "conviction": 70}, 400, 10, "ben", snapshot)

        self.assertEqual(decision["action"], "HOLD")
        self.assertEqual(decision["buyCashPct"], 0)

    def test_max_drawdown_uses_equity_peak(self) -> None:
        points = [{"agent": 100}, {"agent": 120}, {"agent": 90}, {"agent": 110}]

        self.assertEqual(_max_drawdown(points, "agent"), -25.0)

    def test_dividend_context_sums_trailing_year_and_flags_missing_column(self) -> None:
        frame = self.frame.copy()
        frame["Dividends"] = 0.0
        frame.iloc[50, frame.columns.get_loc("Dividends")] = 0.5  # outside the trailing 252-session window at index 310
        frame.iloc[200, frame.columns.get_loc("Dividends")] = 0.5

        recent = _dividend_context(frame, 310, price=110.0)
        long_ago = _dividend_context(self.frame, 310, price=110.0)

        self.assertAlmostEqual(recent["trailingDividendPerShare"], 0.5)
        self.assertEqual(recent["sessionsSinceLastExDividend"], 110)
        self.assertEqual(long_ago["trailingDividendPerShare"], 0.0)
        self.assertIsNone(long_ago["sessionsSinceLastExDividend"])

    def test_partial_position_revalues_with_price_while_cash_stays_flat(self) -> None:
        before = _equity_point(pd.Timestamp("2024-06-03"), 100, 75, 0.25, 1, 100)
        after = _equity_point(pd.Timestamp("2024-06-04"), 80, 75, 0.25, 1, 100)

        self.assertEqual(before["stockExposurePct"], 25.0)
        self.assertEqual(before["agent"], 100.0)
        self.assertEqual(after["agent"], 95.0)
        self.assertEqual(after["cash"], 75.0)


if __name__ == "__main__":
    unittest.main()
