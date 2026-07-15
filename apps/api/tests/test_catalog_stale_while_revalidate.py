from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.market import catalog
from models import MarketUniverseCache


def cached_region(region: str, *, fresh: bool) -> MarketUniverseCache:
    now = datetime.now(timezone.utc)
    return MarketUniverseCache(
        region=region,
        records=[{"symbol": f"{region.upper()}-TEST", "sector": "Technology", "scoreVersion": catalog.SCORING_VERSION}],
        fetchedAt=(now - timedelta(days=2)).isoformat(),
        expiresAt=(now + timedelta(hours=1) if fresh else now - timedelta(hours=1)).isoformat(),
    )


class CatalogStaleWhileRevalidateTests(unittest.TestCase):
    def test_stale_catalog_returns_immediately_and_schedules_refresh(self) -> None:
        stale = cached_region("us", fresh=False)
        with (
            patch.object(catalog, "load_market_universe", return_value=stale),
            patch.object(catalog, "_schedule_refresh") as schedule,
            patch.object(catalog, "save_market_universe"),
        ):
            result = catalog.get_market_catalog(("us",))

        self.assertEqual(result[0]["symbol"], "US-TEST")
        schedule.assert_called_once_with(("us",))

    def test_fresh_catalog_does_not_schedule_refresh(self) -> None:
        fresh = cached_region("us", fresh=True)
        with (
            patch.object(catalog, "load_market_universe", return_value=fresh),
            patch.object(catalog, "_schedule_refresh") as schedule,
            patch.object(catalog, "save_market_universe"),
        ):
            result = catalog.get_market_catalog(("us",))

        self.assertEqual(result[0]["symbol"], "US-TEST")
        schedule.assert_not_called()

    def test_empty_catalog_schedules_warmup_without_blocking(self) -> None:
        with (
            patch.object(catalog, "load_market_universe", return_value=None),
            patch.object(catalog, "_schedule_refresh") as schedule,
        ):
            result = catalog.get_market_catalog(("us", "th"))

        self.assertEqual(result, [])
        schedule.assert_called_once_with(("us", "th"))


if __name__ == "__main__":
    unittest.main()
