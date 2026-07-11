from __future__ import annotations

import unittest
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.store.presets import list_market_presets
from models import DiscoveryKind, LookupResponse
from routes.discover import discover


class CommodityPresetTests(unittest.TestCase):
    def test_lists_core_commodity_presets(self) -> None:
        presets = list_market_presets(kind="commodity")
        by_code = {preset.code: preset for preset in presets}

        self.assertIn("commodity_core", by_code)
        self.assertIn("GC=F", by_code["commodity_core"].symbols)
        self.assertIn("SI=F", by_code["commodity_core"].symbols)
        self.assertIn("CL=F", by_code["commodity_core"].symbols)
        self.assertIn("commodity_etf_proxy", by_code)
        self.assertIn("GLD", by_code["commodity_etf_proxy"].symbols)

    def test_discover_exact_future_symbol(self) -> None:
        with (
            patch("routes.discover.lookup_discovery", return_value=LookupResponse(query="GC=F", kind=DiscoveryKind.all)),
            patch("routes.discover.build_market_page", return_value=([], 1, 0)),
            patch("routes.discover.fetch_symbol_record", return_value={"symbol": "GC=F", "name": "Gold Futures", "price": 2400}),
        ):
            result = discover(q="GC=F", kind=DiscoveryKind.all, page=1, limit=12)

        self.assertEqual(result.live, [{"symbol": "GC=F", "name": "Gold Futures", "price": 2400}])
        self.assertEqual(result.total, 1)

    def test_discover_gold_aliases(self) -> None:
        records = {
            "XAUUSD=X": {"symbol": "XAUUSD=X", "name": "Gold Spot USD", "price": 2400},
            "GC=F": {"symbol": "GC=F", "name": "Gold Futures", "price": 2410},
            "GLD": {"symbol": "GLD", "name": "SPDR Gold Shares", "price": 220},
        }

        with (
            patch("routes.discover.lookup_discovery", return_value=LookupResponse(query="gold", kind=DiscoveryKind.all)),
            patch("routes.discover.build_market_page", return_value=([], 1, 0)),
            patch("routes.discover.fetch_symbol_record", side_effect=lambda symbol: records.get(symbol)),
        ):
            gold = discover(q="gold", kind=DiscoveryKind.all, page=1, limit=12)
            xauusd = discover(q="xauusd", kind=DiscoveryKind.all, page=1, limit=12)

        self.assertEqual([item["symbol"] for item in gold.live], ["XAUUSD=X", "GC=F", "GLD"])
        self.assertEqual(xauusd.live[0]["symbol"], "XAUUSD=X")

    def test_discover_rejects_zero_price_literal(self) -> None:
        with (
            patch("routes.discover.lookup_discovery", return_value=LookupResponse(query="FAKE", kind=DiscoveryKind.all)),
            patch("routes.discover.build_market_page", return_value=([], 1, 0)),
            patch("routes.discover.fetch_symbol_record", return_value={"symbol": "FAKE", "price": 0}),
        ):
            result = discover(q="FAKE", kind=DiscoveryKind.all, page=1, limit=12)

        self.assertEqual(result.live, [])


if __name__ == "__main__":
    unittest.main()
