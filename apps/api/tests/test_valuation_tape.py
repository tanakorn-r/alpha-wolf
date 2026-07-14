from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from models import ValuationVerdict
from routes.analysis import _align_tactical_valuation_state, _valuation_tape_metrics


class ValuationTapeTests(unittest.TestCase):
    def test_tape_metrics_include_session_move_crowd_and_trigger(self) -> None:
        metrics = _valuation_tape_metrics({
            "stock": {"price": 110.0, "changePct": 10.0},
            "history": [
                {"close": 100.0, "volume": 800_000},
                {"open": 101.0, "high": 112.0, "low": 99.0, "close": 109.0, "volume": 900_000},
            ],
            "technicals": {
                "currentVolume": 900_000,
                "avgVolume": 1_800_000,
                "volumeRatio": 0.5,
                "rsi14": 64.0,
                "support": 98.0,
                "resistance": 115.0,
            },
        })

        self.assertEqual(metrics["todayChange"], 10.0)
        self.assertEqual(metrics["todayChangePct"], 10.0)
        self.assertEqual(metrics["previousClose"], 100.0)
        self.assertEqual(metrics["dayOpen"], 101.0)
        self.assertEqual(metrics["dayHigh"], 112.0)
        self.assertEqual(metrics["dayLow"], 99.0)
        self.assertEqual(metrics["volumeRatio"], 0.5)
        self.assertEqual(metrics["resistance"], 115.0)

    def test_tape_metrics_derive_percent_when_quote_change_is_missing(self) -> None:
        metrics = _valuation_tape_metrics({
            "stock": {"price": 105.0},
            "history": [{"close": 100.0}, {"close": 105.0}],
            "technicals": {},
        })

        self.assertEqual(metrics["todayChange"], 5.0)
        self.assertEqual(metrics["todayChangePct"], 5.0)

    def test_building_is_a_valid_tactical_pre_breakout_verdict(self) -> None:
        verdict = ValuationVerdict.model_validate({
            "symbol": "META",
            "name": "Meta Platforms, Inc.",
            "currency": "USD",
            "verdict": "BUILDING",
            "chasingAnswer": "No, price remains below the breakout trigger.",
            "narrative": "The setup is building below resistance.",
            "rightNow": {"action": "WAIT", "note": "Demand volume confirmation.", "conviction": 65},
            "metrics": {"currentPrice": 663.0, "resistance": 677.86, "volumeRatio": 0.34},
            "structureBand": {"now": 663.0, "zoneLabel": "BUILDING"},
            "whatAiSees": [
                {"tone": "WATCH", "title": "Below trigger", "text": "Price has not broken resistance."},
                {"tone": "BAD", "title": "Thin volume", "text": "Volume is below normal."},
            ],
            "thePlay": {"text": "Wait for a confirmed breakout."},
            "recap": "Building, not chasing.",
            "agentFit": "aligned",
            "agentFitReason": "Kai waits for tape confirmation.",
        })

        self.assertEqual(verdict.verdict, "BUILDING")

    def test_pre_breakout_chasing_call_is_aligned_to_building(self) -> None:
        result = _align_tactical_valuation_state({
            "verdict": "CHASING",
            "chasingAnswer": "Yes.",
            "recap": "Chase trap.",
            "metrics": {"currentPrice": 663.23, "resistance": 677.86},
            "rightNow": {"action": "WAIT", "note": "Skip."},
            "structureBand": {"zoneLabel": "CHASING"},
        }, "kai")

        self.assertEqual(result["verdict"], "BUILDING")
        self.assertEqual(result["structureBand"]["zoneLabel"], "BUILDING")
        self.assertIn("2.2% below resistance", result["recap"])

    def test_long_term_agent_call_is_not_rewritten_by_tactical_alignment(self) -> None:
        result = {"verdict": "CHASING", "metrics": {"currentPrice": 90.0, "resistance": 100.0}}

        self.assertIs(_align_tactical_valuation_state(result, "ben"), result)


if __name__ == "__main__":
    unittest.main()
