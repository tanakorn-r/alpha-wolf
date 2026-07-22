from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.ai.openai_client import _calibrate_analyst_brief
from models import AnalystBrief


def _brief(score: int = 84) -> AnalystBrief:
    return AnalystBrief(
        signal="WAIT",
        headline="Wait for confirmation",
        tone="warn",
        confidence=score,
        summary="The setup is mixed.",
        timeHorizon="5 years",
        controllingQuestion="Can owner earnings compound?",
        researchSynthesis="The operating update reinforces the supplied cash-flow evidence.",
        thesis="Evidence is not aligned yet.",
        actionPlan="Wait.",
        decisionRule="Hold if cash conversion persists; trim if it breaks.",
        evidence=["One", "Two", "Three"],
        risks=["Risk one", "Risk two"],
        changeTrigger="Price and volume confirm.",
        recap="Wait for confirmation.",
        agentFit="neutral",
        agentFitReason="I need stronger evidence.",
    )


class AnalystScoreCalibrationTests(unittest.TestCase):
    def test_ben_rating_moves_with_compounding_research(self) -> None:
        base = {"quantScorecard": {"componentScores": {
            "technicalTiming": 60, "swingEntry": 60, "businessQuality": 65,
            "relativeStrength": 60, "platformSetup": 60,
        }}}
        bullish = {**base, "webNewsResearch": {"horizons": [
            {"label": "Owner impact", "direction": "MIXED", "confidence": 60},
            {"label": "Compounding impact", "direction": "BULLISH", "confidence": 90},
        ]}}
        bearish = {**base, "webNewsResearch": {"horizons": [
            {"label": "Owner impact", "direction": "MIXED", "confidence": 60},
            {"label": "Compounding impact", "direction": "BEARISH", "confidence": 90},
        ]}}

        bullish_result = _calibrate_analyst_brief(bullish, _brief(70), "ben")
        bearish_result = _calibrate_analyst_brief(bearish, _brief(70), "ben")

        self.assertGreater(bullish_result.confidence, bearish_result.confidence)
        self.assertGreaterEqual(bullish_result.confidence - bearish_result.confidence, 18)

    def test_candidate_hold_is_normalized_to_wait(self) -> None:
        brief = _brief()
        brief.signal = "HOLD"
        result = _calibrate_analyst_brief(
            {"positionContext": {"isHolding": False}, "quantScorecard": {"componentScores": {"businessQuality": 80}}},
            brief,
            "ben",
        )

        self.assertEqual(result.signal, "WAIT")

    def test_existing_position_can_remain_hold(self) -> None:
        brief = _brief()
        brief.signal = "HOLD"
        result = _calibrate_analyst_brief(
            {"positionContext": {"isHolding": True}, "quantScorecard": {"componentScores": {"businessQuality": 80}}},
            brief,
            "ben",
        )

        self.assertEqual(result.signal, "HOLD")

    def test_same_model_score_varies_by_persona(self) -> None:
        context = {"quantScorecard": {"componentScores": {
            "technicalTiming": 88,
            "swingEntry": 82,
            "businessQuality": 44,
            "relativeStrength": 76,
            "platformSetup": 61,
        }}}

        kai = _calibrate_analyst_brief(context, _brief(), "kai")
        ben = _calibrate_analyst_brief(context, _brief(), "ben")

        self.assertNotEqual(kai.confidence, ben.confidence)
        self.assertGreater(kai.confidence, ben.confidence)

    def test_same_persona_varies_with_ticker_evidence(self) -> None:
        strong = {"quantScorecard": {"componentScores": {
            "technicalTiming": 80, "swingEntry": 78, "businessQuality": 85,
            "relativeStrength": 74, "platformSetup": 80,
        }}}
        weak = {"quantScorecard": {"componentScores": {
            "technicalTiming": 38, "swingEntry": 31, "businessQuality": 42,
            "relativeStrength": 35, "platformSetup": 40,
        }}}

        self.assertGreater(
            _calibrate_analyst_brief(strong, _brief(), "vera").confidence,
            _calibrate_analyst_brief(weak, _brief(), "vera").confidence,
        )


if __name__ == "__main__":
    unittest.main()
