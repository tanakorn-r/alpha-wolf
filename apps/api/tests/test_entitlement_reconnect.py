from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.store import entitlements


class _Cursor:
    def __init__(self, row=None):
        self._row = row

    def fetchone(self):
        return self._row


class _Connection:
    def __init__(self, *, fail_update: bool = False):
        self.fail_update = fail_update
        self.execute_calls = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, sql, params):
        self.execute_calls += 1
        if self.fail_update and self.execute_calls == 2:
            raise ValueError('Hrana: status=404, body={"error":"stream not found: stale"}')
        if sql.lstrip().startswith("SELECT balance"):
            return _Cursor((30, 4))
        return _Cursor()

    def commit(self):
        return None


class EntitlementReconnectTests(unittest.TestCase):
    def test_idempotent_balance_maintenance_retries_a_stale_stream(self) -> None:
        stale = _Connection(fail_update=True)
        fresh = _Connection()
        with patch.object(entitlements, "connect", side_effect=[stale, fresh]):
            row = entitlements._ensure_credit_balance(7, 30, "2026-07-16T00:00:00+00:00")

        self.assertEqual(row, (30, 4))
        self.assertEqual(stale.execute_calls, 2)
        self.assertEqual(fresh.execute_calls, 3)


if __name__ == "__main__":
    unittest.main()
