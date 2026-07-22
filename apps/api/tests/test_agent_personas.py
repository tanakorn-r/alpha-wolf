from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.ai.agents import AGENTS, ANALYST_PERSPECTIVES, DAILY_BRIEF_PERSPECTIVES, compose_instructions
from internal.ai.context import build_analysis_context, build_today_context
from internal.ai.openai_client import _analyst_brief_instructions, _today_performance_instructions


class AgentPersonaTests(unittest.TestCase):
    def test_analyst_voice_contract_is_emotional_and_persona_specific(self) -> None:
        prompt = _analyst_brief_instructions()

        self.assertIn("controlled banker authority", prompt)
        self.assertIn("proud of spotting the setup before the crowd", prompt)
        self.assertIn("risk-first", prompt)
        self.assertIn("warm but calculated", prompt)
        self.assertIn("Gen-Z swagger", prompt)
        self.assertIn("patient business owner", prompt)
        self.assertIn("decisive CIO", prompt)
        self.assertIn("may never override supplied evidence", prompt)

    def test_industry_trust_is_horizon_specific(self) -> None:
        vera = compose_instructions("Return analysis.", "vera")
        rex = compose_instructions("Return analysis.", "rex")
        kai = compose_instructions("Return analysis.", "kai")
        nadia = compose_instructions("Return analysis.", "nadia")

        self.assertIn("This is strategic ownership evidence", vera)
        self.assertIn("do NOT use peer P/B, P/E, ROE", rex)
        self.assertIn("cold tape", kai)
        self.assertIn("quantified\n    cross-sectional edge", nadia)

    def test_every_agent_has_a_distinct_decision_contract(self) -> None:
        contracts = [str(agent.get("decisionContract") or "") for agent in AGENTS]

        self.assertTrue(all(contracts))
        self.assertEqual(len(contracts), len(set(contracts)))

    def test_dante_is_the_exclusive_red_live_quant(self) -> None:
        dante = next(agent for agent in AGENTS if agent["id"] == "dante")
        prompt = compose_instructions("Return one live trade contract.", "dante", analyst_task=True)

        self.assertEqual(dante["color"], "#ff4655")
        self.assertTrue(dante["premium"])
        self.assertTrue(dante["liveTradeOnly"])
        self.assertEqual(dante["avatarUrl"], "/agents/dante-cross.png")
        self.assertIn("Forex and gold session structure", dante["knows"])
        self.assertIn("LONG, SHORT, or WAIT", prompt)
        self.assertIn("hard stop", prompt)
        self.assertIn("TP1", prompt)
        self.assertIn("scheduled macro event", prompt)
        self.assertIn("You exist only inside Live Trading", prompt)

    def test_every_agent_has_a_distinct_analyst_perspective(self) -> None:
        ids = {agent["id"] for agent in AGENTS}
        north_stars = [ANALYST_PERSPECTIVES[agent_id]["northStar"] for agent_id in ids]
        outlook_titles = [ANALYST_PERSPECTIVES[agent_id]["outlookTitle"] for agent_id in ids]
        section_sets = [ANALYST_PERSPECTIVES[agent_id]["sections"] for agent_id in ids]
        sizing_methods = [ANALYST_PERSPECTIVES[agent_id]["sizing"] for agent_id in ids]
        analytics = [ANALYST_PERSPECTIVES[agent_id]["analytics"] for agent_id in ids]

        self.assertEqual(set(ANALYST_PERSPECTIVES), ids)
        self.assertEqual(len(north_stars), len(set(north_stars)))
        self.assertEqual(len(outlook_titles), len(set(outlook_titles)))
        self.assertEqual(len(section_sets), len(set(section_sets)))
        self.assertEqual(len(sizing_methods), len(set(sizing_methods)))
        self.assertEqual(len(analytics), len(set(analytics)))

    def test_analyst_prompts_change_horizon_and_method(self) -> None:
        vera = compose_instructions("Return longTermView.", "vera", analyst_task=True)
        rex = compose_instructions("Return longTermView.", "rex", analyst_task=True)
        nadia = compose_instructions("Return longTermView.", "nadia", analyst_task=True)
        sam = compose_instructions("Return longTermView.", "sam", analyst_task=True)
        kai = compose_instructions("Return longTermView.", "kai", analyst_task=True)
        ben = compose_instructions("Return longTermView.", "ben", analyst_task=True)
        prime = compose_instructions("Return longTermView.", "alphawolf", analyst_task=True)

        self.assertIn("risk-adjusted owner value", vera)
        self.assertIn("liquid catalysts", rex)
        self.assertIn("Scenario book & hedge architecture", nadia)
        self.assertIn("stochastic %K/%D", nadia)
        self.assertIn("gold call", nadia)
        self.assertIn("homebuilder put", nadia)
        self.assertIn("institutional credit hedge", nadia)
        self.assertIn("growing income engine", sam)
        self.assertIn("durable adoption, narrative heat", kai)
        self.assertIn("fast-buy trigger", kai)
        self.assertIn("Swing setup & exit map", rex)
        self.assertIn("reinvest retained earnings at high returns", ben)
        self.assertIn("required outlook horizon: 5 years", ben)
        self.assertIn("operating cash flow minus capital spending", ben)
        self.assertIn("Total assets are not a spendable budget", ben)
        self.assertIn("internally generated cash versus debt/equity funding", ben)
        self.assertIn("ALLOCATION LADDER", ben)
        self.assertIn("not automatic AVOID", ben)
        self.assertIn("comparative advantage", ben)
        self.assertIn("quote-screen noise", ben)
        self.assertIn("Dow Theory, Wyckoff phase", rex)
        self.assertIn("Elliott is low-weight/heuristic", nadia)
        self.assertIn("Fibonacci extensions", kai)
        self.assertIn("Do not use a majority vote, simple average", prime)
        self.assertIn("ALPHAWOLF PRIME HYBRID COUNCIL", prime)
        self.assertIn("SEVEN DESKS", prime)
        self.assertIn("exposure-normalized, risk-adjusted outcomes", prime)
        self.assertIn("Never promise to win", prime)

    def test_compact_analyst_fuses_research_without_large_report_schema(self) -> None:
        task = _analyst_brief_instructions()
        ben = compose_instructions(task, "ben", analyst_task=True, analyst_brief_task=True)
        rex = compose_instructions(task, "rex", analyst_task=True, analyst_brief_task=True)

        self.assertIn("Join live company/country/industry research", ben)
        self.assertIn("presales/backlog/project conversion", ben)
        self.assertIn("researchSynthesis", ben)
        self.assertIn("decisionRule", ben)
        self.assertNotIn("Return exactly four perspectiveSections", ben)
        self.assertIn("maximum three-month lifecycle", rex)
        self.assertNotEqual(ben, rex)

    def test_daily_brief_horizons_are_agent_specific(self) -> None:
        self.assertEqual(set(DAILY_BRIEF_PERSPECTIVES), {agent["id"] for agent in AGENTS})
        task = _today_performance_instructions()
        ben = compose_instructions(task, "ben", daily_brief_task=True)
        rex = compose_instructions(task, "rex", daily_brief_task=True)

        self.assertIn("Plan horizon: 5 years", ben)
        self.assertIn("one-day move, RSI, MACD, SMA20/50/200 miss", ben)
        self.assertIn("must not call\nthe plan BROKEN merely because price missed a moving average", ben)
        self.assertIn("Lead with exactly what the user should do today", ben)
        self.assertIn("ADD is rare", ben)
        self.assertIn("SELL/REDUCE needs the", ben)
        self.assertIn("THINK IN THIS ORDER", ben)
        self.assertIn("agentDecisionEvidence.inputPriority", ben)
        self.assertIn("Price resistance alone", ben)
        self.assertIn("buyScore 80-100 requires ADD", ben)
        self.assertIn("Plan horizon: 3 days to 3 months", rex)
        self.assertIn("Failed levels can put the plan BEHIND quickly", rex)
        titles = [value["analysisTitle"] for value in DAILY_BRIEF_PERSPECTIVES.values()]
        sections = [value["analysisSections"] for value in DAILY_BRIEF_PERSPECTIVES.values()]
        self.assertEqual(len(titles), len(set(titles)))
        self.assertEqual(len(sections), len(set(sections)))
        self.assertIn("Ben's owner update", ben)
        self.assertIn("Rex's live trade map", rex)

    def test_daily_brief_receives_character_specific_company_evidence(self) -> None:
        bundle = {
            "stock": {"symbol": "SCB.BK", "name": "SCB X", "price": 120, "currency": "THB", "volume": 1_000_000},
            "strategy": "stable_dca",
            "business": {"sector": "Financial Services", "industry": "Banks", "priceToBook": 0.8, "roe": 11, "debtToEquity": 500},
            "technicals": {"signal": "HOLD", "support": 115, "resistance": 125, "volumeRatio": 1.2},
            "performance": {"returns": {"1d": 1.0, "1y": 12.0}},
            "verdict": {"action": "HOLD", "score": 72},
            "history": [{"date": "2026-07-13", "close": 120}],
            "news": [],
        }
        financials = {"cashFlow": {"latest": {"Operating Cash Flow": 100}}}
        market = {"benchmark": {"returnPct": 8}, "stock": {"returnPct": 12}, "points": []}
        domain = {"industryInsight": {"name": "Banks"}}

        vera = build_today_context(bundle, position_context={"isHolding": True}, financials=financials, market_comparison=market, domain_insights=domain, agent_id="vera")
        rex = build_today_context(bundle, position_context={"isHolding": True}, financials=financials, market_comparison=market, domain_insights=domain, agent_id="rex")

        self.assertEqual(vera["agentDecisionEvidence"]["agent"], "vera")
        self.assertEqual(rex["agentDecisionEvidence"]["agent"], "rex")
        self.assertIn("valuation", vera["agentDecisionEvidence"]["primary"])
        self.assertIn("technicals", rex["agentDecisionEvidence"]["primary"])
        self.assertNotEqual(vera["agentDecisionEvidence"]["inputPriority"], rex["agentDecisionEvidence"]["inputPriority"])
        self.assertEqual(vera["companyStructureProfile"]["archetype"], "BANK")

    def test_every_ai_task_receives_exclusive_agent_method(self) -> None:
        vera = compose_instructions("Any AI task.", "vera")
        rex = compose_instructions("Any AI task.", "rex")
        ben = compose_instructions("Any AI task.", "ben")

        self.assertIn("AGENT-EXCLUSIVE METHOD", vera)
        self.assertIn("risk-adjusted owner value", vera)
        self.assertIn("liquid catalysts", rex)
        self.assertIn("reinvest retained earnings at high returns", ben)

    def test_decisive_scores_cannot_fall_back_to_hold(self) -> None:
        prompt = compose_instructions("Return one decision.", "vera")

        self.assertIn("21-39 means\n  TRIM/REDUCE", prompt)
        self.assertIn("1-20 means SELL/EXIT", prompt)
        self.assertIn("Do not pair\n  HOLD with a 1-39 score", prompt)

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

    def test_nadia_builds_grounded_cross_asset_hedges(self) -> None:
        nadia = compose_instructions("Explain the portfolio concept.", "nadia", analyst_task=True)

        self.assertIn("client's base exposure", nadia)
        self.assertIn("scenario tree", nadia)
        self.assertIn("convex overlay", nadia)
        self.assertIn("homebuilder credit-default hedge", nadia)
        self.assertIn("never invent strike, expiry, premium", nadia)
        self.assertIn("CDS as institutional/not generally retail-accessible", nadia)

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
