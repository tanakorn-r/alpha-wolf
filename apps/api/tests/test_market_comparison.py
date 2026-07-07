from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.market.detail import _best_benchmark_series, _same_symbol


class MarketComparisonTests(unittest.TestCase):
    def test_same_symbol_matches_case_insensitively(self) -> None:
        self.assertTrue(_same_symbol("epg.bk", "EPG.BK"))

    def test_thai_benchmark_falls_back_when_set_index_has_too_few_points(self) -> None:
        with (
            patch("internal.market.detail.fetch_history"),
            patch("internal.market.detail.make_ticker", side_effect=lambda symbol: symbol),
            patch(
                "internal.market.detail._monthly_rebased",
                side_effect=[
                    {"2026-07": 100.0},
                    {"2025-07": 100.0, "2026-07": 110.0},
                ],
            ),
        ):
            symbol, name, series = _best_benchmark_series("th")

        self.assertEqual(symbol, "TDEX.BK")
        self.assertEqual(name, "SET market proxy")
        self.assertEqual(len(series), 2)


if __name__ == "__main__":
    unittest.main()
