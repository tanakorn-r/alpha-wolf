from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.market import detail


class DetailPendingCacheTests(unittest.TestCase):
    def test_pending_bundle_uses_short_cache_ttl(self) -> None:
        pending = {"stock": {"symbol": "TEST"}, "dataPending": True}

        with (
            patch.object(detail, "cache_get", return_value=None),
            patch.object(detail, "_build_detail_bundle_uncached", return_value=pending),
            patch.object(detail, "cache_set") as cache_set,
        ):
            result = detail.build_detail_bundle("TEST", "capitalized")

        self.assertEqual(result, pending)
        self.assertEqual(cache_set.call_args.args[3], detail.PENDING_DETAIL_TTL_SECONDS)

    def test_ready_bundle_uses_normal_cache_ttl(self) -> None:
        ready = {"stock": {"symbol": "TEST"}, "dataPending": False}

        with (
            patch.object(detail, "cache_get", return_value=None),
            patch.object(detail, "_build_detail_bundle_uncached", return_value=ready),
            patch.object(detail, "cache_set") as cache_set,
        ):
            detail.build_detail_bundle("TEST", "capitalized")

        self.assertEqual(cache_set.call_args.args[3], detail.DETAIL_TTL_SECONDS)


if __name__ == "__main__":
    unittest.main()
