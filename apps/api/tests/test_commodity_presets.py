from __future__ import annotations

import unittest
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.market import catalog as market_catalog
from internal.store.presets import list_market_presets
from models import DiscoveryKind, LookupResponse
from routes.discover import discover


class CommodityPresetTests(unittest.TestCase):
    def test_thai_catalog_excludes_foreign_depositary_receipts(self) -> None:
        for symbol in ("PEP80.BK", "SINGTEL80.BK", "TENCENT11.BK"):
            with self.subTest(symbol=symbol):
                self.assertFalse(market_catalog._is_supported_quote({"symbol": symbol, "name": "Foreign company"}, "th"))

        self.assertTrue(market_catalog._is_supported_quote({"symbol": "BDMS.BK", "name": "Bangkok Dusit Medical Services"}, "th"))
        self.assertTrue(market_catalog._is_supported_quote({"symbol": "2S.BK", "name": "2S Metal"}, "th"))

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

    def test_discover_scopes_all_to_configured_markets(self) -> None:
        with (
            patch("routes.discover.cache_get", return_value=None),
            patch("routes.discover.cache_set") as cache,
            patch("routes.discover.build_market_page", return_value=([], 1, 0)) as build,
        ):
            result = discover(
                q=None,
                kind=DiscoveryKind.all,
                strategy="stable_dca",
                mode=None,
                sort="score",
                region="all",
                markets="japan,us,japan",
                sector=None,
                page=1,
                limit=12,
            )

        self.assertEqual(build.call_args.kwargs["region"], "all")
        self.assertEqual(build.call_args.kwargs["markets"], ("japan", "us"))
        self.assertTrue(result.warming)
        self.assertEqual(cache.call_args.args[3], 2)

    def test_additional_market_catalog_is_built_with_its_filter_key(self) -> None:
        quote = {
            "symbol": "7203.T",
            "longName": "Toyota Motor Corporation",
            "regularMarketPrice": 3000,
            "regularMarketPreviousClose": 2970,
            "marketCap": 40_000_000_000_000,
            "currency": "JPY",
        }
        with (
            patch.object(market_catalog.yf, "screen", return_value={"quotes": [quote]}) as screen,
            patch.object(market_catalog, "save_market_universe") as save,
        ):
            result = market_catalog._refresh_region("japan")

        self.assertEqual(screen.call_count, 1)
        self.assertEqual(result.region, "japan")
        self.assertEqual(result.records[0]["indexes"], ["stock", "japan"])
        save.assert_called_once()


if __name__ == "__main__":
    unittest.main()
