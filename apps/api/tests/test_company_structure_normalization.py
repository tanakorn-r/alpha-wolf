from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.ai.agents import compose_instructions
from internal.ai.context import build_analysis_context
from internal.market.buy_timing import _business_structure
from internal.market.company_structure import classify_company_structure
from internal.market.detail import build_peer_profile


class CompanyStructureNormalizationTests(unittest.TestCase):
    def test_thai_bank_uses_stored_structural_peers_when_live_industry_screen_is_empty(self) -> None:
        records = [
            {"symbol": "KTB.BK", "name": "Krung Thai Bank", "sector": "Financial Services", "marketCap": 575e9, "priceToBook": 1.23, "peRatio": 11.8, "oneYearReturn": 105, "strategyScores": {"stable_dca": 60}},
            {"symbol": "KBANK.BK", "name": "Kasikornbank", "sector": "Financial Services", "marketCap": 550e9, "priceToBook": 0.93, "peRatio": 10.9, "oneYearReturn": 46, "strategyScores": {"stable_dca": 65}},
            {"symbol": "SCB.BK", "name": "SCB X", "sector": "Financial Services", "marketCap": 527e9, "priceToBook": 1.05, "peRatio": 11.7, "oneYearReturn": 32, "strategyScores": {"stable_dca": 63}},
            {"symbol": "BBL.BK", "name": "Bangkok Bank", "sector": "Financial Services", "marketCap": 375e9, "priceToBook": 0.65, "peRatio": 8.5, "oneYearReturn": 36, "strategyScores": {"stable_dca": 70}},
        ]
        stock = {"symbol": "KTB.BK", "name": "Krung Thai Bank", "currency": "THB"}
        business = {"sector": "Financial Services", "industry": "Banks - Regional", "marketCap": 575e9, "priceToBook": 1.23, "peRatio": 11.8}
        with patch("internal.market.detail.get_industry_peers", return_value=[]), patch("internal.market.detail.load_market_universe", return_value=SimpleNamespace(records=records)):
            peers = build_peer_profile(stock, business, "stable_dca")

        self.assertEqual(peers["source"], "Stored regional structural-peer cohort")
        self.assertEqual(peers["sizeMatchedCount"], 3)
        self.assertAlmostEqual(peers["peerMedianPriceToBook"], 0.93)
        self.assertGreater(peers["priceToBookVsPeerPct"], 30)

    def test_large_thai_bank_is_not_rejected_by_corporate_debt_rule(self) -> None:
        business = {
            "sector": "Financial Services",
            "industry": "Banks - Regional",
            "marketCap": 420_000_000_000,
            "roe": 8.7,
            "profitMargin": 13.5,
            "debtToEquity": 1560.0,
        }
        profile = classify_company_structure(business, {"currency": "THB"})
        structure = _business_structure(business, profile)

        self.assertEqual(profile["archetype"], "BANK")
        self.assertEqual(profile["sizeBucket"], "LARGE_CAP")
        self.assertEqual(profile["reasoningMode"], "SOFT_BIAS")
        self.assertEqual(structure["status"], "MIXED")
        self.assertTrue(structure["ownershipEligible"])
        self.assertEqual(structure["industryNativeStatus"], "POSITIVE_BUT_SPECIALIST_METRICS_INCOMPLETE")
        self.assertTrue(structure["genericLeverageIgnored"])
        self.assertNotIn("very high debt to equity", structure["reasons"])
        self.assertIn("Do not apply", profile["leverageRule"])

    def test_general_company_keeps_corporate_leverage_guardrail(self) -> None:
        business = {
            "sector": "Industrials",
            "industry": "Specialty Industrial Machinery",
            "roe": 8.7,
            "profitMargin": 13.5,
            "debtToEquity": 300.0,
        }
        profile = classify_company_structure(business, {"currency": "THB"})
        structure = _business_structure(business, profile)

        self.assertEqual(profile["archetype"], "INDUSTRIAL")
        self.assertEqual(structure["status"], "AT_RISK")
        self.assertIn("very high debt to equity", structure["reasons"])

    def test_mint_uses_hospitality_company_and_seasonality_bias(self) -> None:
        business = {
            "name": "Minor International Public Company Limited",
            "sector": "Consumer Cyclical",
            "industry": "Lodging",
            "marketCap": 138_000_000_000,
            "roe": 9.0,
            "profitMargin": 5.4,
            "debtToEquity": 230.0,
        }
        profile = classify_company_structure(business, {"symbol": "MINT.BK", "currency": "THB"})
        structure = _business_structure(business, profile)

        self.assertEqual(profile["archetype"], "HOSPITALITY_RESTAURANT")
        self.assertEqual(profile["sizeBucket"], "LARGE_CAP")
        self.assertIn("diversified global hotel-and-restaurant group", profile["companySpecificBias"])
        self.assertIn("position-sizing input", profile["seasonalityRule"])
        self.assertIn("Seasonal strength or weakness alone", profile["trimRule"])
        self.assertNotEqual(structure["status"], "AT_RISK")
        self.assertTrue(structure["ownershipEligible"])
        self.assertTrue(structure["genericLeverageIgnored"])

    def test_property_developer_uses_inventory_and_coverage_context_not_generic_debt_ceiling(self) -> None:
        business = {
            "name": "Example Thai Developer",
            "sector": "Real Estate",
            "industry": "Real Estate - Development",
            "roe": 8.5,
            "profitMargin": 12.0,
            "debtToEquity": 230.0,
        }
        profile = classify_company_structure(business, {"symbol": "SIRI.BK", "currency": "THB"})
        structure = _business_structure(business, profile)

        self.assertEqual(profile["archetype"], "REAL_ESTATE_DEVELOPER")
        self.assertNotEqual(structure["status"], "AT_RISK")
        self.assertTrue(structure["ownershipEligible"])
        self.assertTrue(structure["genericLeverageIgnored"])
        self.assertIn("inventory", profile["leverageRule"])

    def test_major_industries_receive_native_rules_and_company_updates(self) -> None:
        cases = [
            ("Insurance - Diversified", "Financial Services", "INSURER"),
            ("REIT - Retail", "Real Estate", "REIT"),
            ("Real Estate - Development", "Real Estate", "REAL_ESTATE_DEVELOPER"),
            ("Utilities - Regulated Electric", "Utilities", "UTILITY"),
            ("Medical Care Facilities", "Healthcare", "HEALTHCARE"),
            ("Beverages - Non-Alcoholic", "Consumer Defensive", "CONSUMER_STAPLES"),
            ("Specialty Retail", "Consumer Cyclical", "CONSUMER_DISCRETIONARY"),
            ("Telecom Services", "Communication Services", "TELECOM"),
            ("Airlines", "Industrials", "TRANSPORTATION"),
            ("Asset Management", "Financial Services", "FINANCIAL_SERVICES"),
            ("Specialty Chemicals", "Basic Materials", "CYCLICAL"),
            ("Software - Application", "Technology", "GROWTH_TECH"),
            ("Specialty Industrial Machinery", "Industrials", "INDUSTRIAL"),
        ]
        for industry, sector, expected in cases:
            with self.subTest(industry=industry):
                profile = classify_company_structure(
                    {"name": f"Example {industry}", "sector": sector, "industry": industry},
                    {"symbol": "EXAMPLE", "currency": "USD"},
                )
                self.assertEqual(profile["archetype"], expected)
                self.assertTrue(profile["primaryMetrics"])
                self.assertTrue(profile["valuationRule"])
                self.assertTrue(profile["leverageRule"])
                self.assertTrue(profile["seasonalityRule"])
                self.assertTrue(profile["trimRule"])
                self.assertIn("Example", profile["companySpecificBias"])

    def test_every_analysis_context_carries_structure_and_size_profile(self) -> None:
        bundle = {
            "stock": {"symbol": "SCB.BK", "currency": "THB"},
            "business": {"sector": "Financial Services", "industry": "Banks - Regional", "marketCap": 420_000_000_000},
            "performance": {},
            "technicals": {},
            "verdict": {},
            "peerRank": {},
        }
        context = build_analysis_context(bundle, financials={}, market_comparison={}, domain_insights={}, agent_id="vera")

        self.assertEqual(context["companyStructureProfile"]["archetype"], "BANK")
        self.assertEqual(context["agentInputPack"]["primary"]["companyStructureProfile"]["sizeBucket"], "LARGE_CAP")

    def test_universal_agent_prompt_forbids_industrial_bank_rules(self) -> None:
        instructions = compose_instructions("Return grounded JSON.", "vera")
        self.assertIn("COMPANY-STRUCTURE BIAS", instructions)
        self.assertIn("Never score a deposit-funded bank", instructions)
        self.assertIn("For hospitality/restaurant operators", instructions)
        self.assertIn("companySpecificBias", instructions)
        self.assertIn("never a mechanical verdict", instructions)


if __name__ == "__main__":
    unittest.main()
