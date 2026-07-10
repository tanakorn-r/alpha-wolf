from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.ai.agents import AGENTS, compose_instructions
from internal.ai.context import build_analysis_context


class AgentPersonaTests(unittest.TestCase):
    def test_every_agent_has_a_distinct_decision_contract(self) -> None:
        contracts = [str(agent.get("decisionContract") or "") for agent in AGENTS]

        self.assertTrue(all(contracts))
        self.assertEqual(len(contracts), len(set(contracts)))

    def test_ben_does_not_use_trader_pullback_logic(self) -> None:
        prompt = compose_instructions("Generic task example: wait for a pullback.", "ben")

        self.assertIn("Never WAIT for a chart pullback", prompt)
        self.assertIn("wonderful business at a sensible (not perfect) price", prompt)
        self.assertLess(prompt.index("Generic task example"), prompt.index("CONFLICT PRIORITY"))

    def test_rex_and_nadia_have_different_reasons_to_wait(self) -> None:
        rex = compose_instructions("Analyze the signal.", "rex")
        nadia = compose_instructions("Analyze the signal.", "nadia")

        self.assertIn("pullback, breakout trigger, or failed retest", rex)
        self.assertIn("WAIT must name the failed threshold or next rule event", nadia)
        self.assertNotEqual(rex, nadia)

    def test_strategy_mandate_does_not_masquerade_as_agent_profile(self) -> None:
        bundle = {
            "stock": {"symbol": "TEST", "name": "Test Co", "price": 100, "currency": "USD"},
            "strategy": "momentum",
            "mode": "swing",
            "business": {},
            "performance": {},
            "technicals": {},
            "verdict": {},
            "outlook": {},
            "peerRank": {},
            "dividendPattern": {},
            "news": [],
            "history": [],
        }

        context = build_analysis_context(
            bundle,
            financials={},
            market_comparison={},
            domain_insights={},
            agent_id="ben",
        )

        self.assertNotIn("agentProfile", context)
        self.assertEqual(context["strategyMandate"]["name"], "Momentum / swing setup requested by the page")
        self.assertEqual(context["agentInputPack"]["agent"], "ben")
        self.assertIn("technicalsAsNoiseCheck", context["agentInputPack"]["secondary"])


if __name__ == "__main__":
    unittest.main()
