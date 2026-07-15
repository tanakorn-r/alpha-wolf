from __future__ import annotations

import queue
import sys
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.store import db as store_db


class FakeLibsqlConnection:
    pass


class LibsqlPoolTests(unittest.TestCase):
    def setUp(self) -> None:
        self.patches = [
            patch.object(store_db, "DATABASE_URL", "libsql://test"),
            patch.object(store_db, "LIBSQL_POOL_SIZE", 2),
            patch.object(store_db, "LibsqlConnection", FakeLibsqlConnection),
            patch.object(store_db, "_libsql_pool", queue.LifoQueue(maxsize=2)),
            patch.object(store_db, "_libsql_pool_created", 0),
        ]
        for active_patch in self.patches:
            active_patch.start()

    def tearDown(self) -> None:
        for active_patch in reversed(self.patches):
            active_patch.stop()

    def test_pool_allows_two_parallel_leases_and_reuses_them(self) -> None:
        first_lease = store_db.connect()
        second_lease = store_db.connect()
        first = first_lease.__enter__()
        second = second_lease.__enter__()

        self.assertIsNot(first, second)
        self.assertEqual(store_db._libsql_pool_created, 2)

        first_lease.__exit__(None, None, None)
        with store_db.connect() as reused:
            self.assertIs(reused, first)

        second_lease.__exit__(None, None, None)

    def test_third_lease_waits_until_a_connection_is_returned(self) -> None:
        first_lease = store_db.connect()
        second_lease = store_db.connect()
        first_lease.__enter__()
        second_lease.__enter__()
        acquired = threading.Event()
        release = threading.Event()

        def lease_third() -> None:
            with store_db.connect():
                acquired.set()
                release.wait(timeout=1)

        worker = threading.Thread(target=lease_third)
        worker.start()
        self.assertFalse(acquired.wait(timeout=0.05))

        first_lease.__exit__(None, None, None)
        self.assertTrue(acquired.wait(timeout=1))
        release.set()
        worker.join(timeout=1)
        second_lease.__exit__(None, None, None)


if __name__ == "__main__":
    unittest.main()
