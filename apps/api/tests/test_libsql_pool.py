from __future__ import annotations

import queue
import sys
import threading
import types
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.store import db as store_db


class FakeLibsqlConnection:
    def __init__(self):
        self.closed = False

    def close(self) -> None:
        self.closed = True


class FakeResult:
    def __init__(self, rows=None):
        self.rows = rows or []
        self.rows_affected = 0


class ScriptedRemoteConnection:
    def __init__(self, actions):
        self.actions = list(actions)
        self.closed = False

    def execute(self, sql, params):
        action = self.actions.pop(0)
        if isinstance(action, BaseException):
            raise action
        return action

    def commit(self) -> None:
        return None

    def close(self) -> None:
        self.closed = True


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

    def test_terminal_connection_error_is_not_returned_to_pool(self) -> None:
        lease = store_db.connect()
        connection = lease.__enter__()

        error = ValueError("Hrana: api error: stream not found")
        lease.__exit__(ValueError, error, None)

        self.assertTrue(connection.closed)
        self.assertEqual(store_db._libsql_pool_created, 0)
        self.assertTrue(store_db._libsql_pool.empty())


class LibsqlReconnectTests(unittest.TestCase):
    def _connection(self, *remotes: ScriptedRemoteConnection):
        created = []

        def connect(**kwargs):
            remote = remotes[len(created)]
            created.append(remote)
            return remote

        module = types.SimpleNamespace(connect=connect)
        return patch.dict(sys.modules, {"libsql": module}), created

    def test_dead_stream_reconnects_and_retries_safe_statement_once(self) -> None:
        stale = ScriptedRemoteConnection([ValueError("Hrana: stream not found: dead")])
        fresh = ScriptedRemoteConnection([FakeResult(rows=[("session",)])])
        module_patch, created = self._connection(stale, fresh)

        with module_patch, patch.object(store_db, "DATABASE_URL", "libsql://test"):
            connection = store_db.LibsqlConnection()
            row = connection.execute("SELECT token FROM auth_sessions").fetchone()

        self.assertEqual(row, ("session",))
        self.assertEqual(created, [stale, fresh])
        self.assertTrue(stale.closed)

    def test_dead_stream_is_not_retried_after_successful_write(self) -> None:
        stale = ScriptedRemoteConnection([
            FakeResult(),
            ValueError("Hrana: stream not found: dead"),
        ])
        unused = ScriptedRemoteConnection([FakeResult()])
        module_patch, created = self._connection(stale, unused)

        with module_patch, patch.object(store_db, "DATABASE_URL", "libsql://test"):
            connection = store_db.LibsqlConnection()
            connection.execute("INSERT INTO events(value) VALUES(?)", ("one",))
            with self.assertRaisesRegex(ValueError, "stream not found"):
                connection.execute("SELECT value FROM events")

        self.assertEqual(created, [stale])


if __name__ == "__main__":
    unittest.main()
