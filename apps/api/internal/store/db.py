from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "alpha_wolf.sqlite3"
DATABASE_URL = os.getenv("LIBSQL_DATABASE_URL") or os.getenv("TURSO_DATABASE_URL") or os.getenv("TURSO_URL")
DATABASE_AUTH_TOKEN = os.getenv("LIBSQL_AUTH_TOKEN") or os.getenv("TURSO_AUTH_TOKEN")


class LibsqlCursor:
    def __init__(self, result: Any):
        self._result = result
        self.lastrowid = getattr(result, "lastrowid", None)

    def fetchone(self):
        if hasattr(self._result, "fetchone"):
            return self._result.fetchone()
        rows = getattr(self._result, "rows", [])
        return rows[0] if rows else None

    def fetchall(self):
        if hasattr(self._result, "fetchall"):
            return self._result.fetchall()
        return list(getattr(self._result, "rows", []))


class LibsqlConnection:
    def __init__(self):
        import libsql

        self._conn = libsql.connect(
            database=DATABASE_URL,
            auth_token=DATABASE_AUTH_TOKEN or "",
        )

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()
        return False

    def execute(self, sql: str, params: tuple[Any, ...] | list[Any] | None = None) -> LibsqlCursor:
        result = self._conn.execute(sql, list(params or []))
        return LibsqlCursor(result)

    def commit(self) -> None:
        self._conn.commit()

    def close(self) -> None:
        pass  # libsql connections are managed by the library


class ClosingSQLiteConnection(sqlite3.Connection):
    """SQLite transaction context that also closes its file descriptor on exit."""

    def __exit__(self, exc_type, exc, tb):
        try:
            return super().__exit__(exc_type, exc, tb)
        finally:
            self.close()


def connect() -> sqlite3.Connection | LibsqlConnection:
    if DATABASE_URL and DATABASE_URL.startswith(("libsql://", "https://", "http://")):
        return LibsqlConnection()

    db = sqlite3.connect(DB_PATH, factory=ClosingSQLiteConnection)
    db.row_factory = sqlite3.Row
    # WAL lets readers (e.g. preset queries) proceed while a batch write commits,
    # instead of every connection blocking on the same file lock.
    db.execute("PRAGMA journal_mode=WAL")
    return db


def migrate() -> None:
    if not DATABASE_URL:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS holdings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL UNIQUE,
                shares REAL NOT NULL,
                average_cost REAL NOT NULL,
                strategy TEXT NOT NULL,
                monthly_dca REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS dca_orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                amount REAL NOT NULL,
                scheduled_for TEXT NOT NULL,
                strategy TEXT NOT NULL,
                status TEXT NOT NULL,
                executed_price REAL,
                shares REAL,
                created_at TEXT NOT NULL
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS market_universe_cache (
                region TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                fetched_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS yahoo_data_cache (
                cache_key TEXT PRIMARY KEY,
                symbol TEXT NOT NULL,
                data_type TEXT NOT NULL,
                period TEXT NOT NULL DEFAULT '',
                payload TEXT NOT NULL,
                fetched_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            )
            """
        )
        db.execute(
            "CREATE INDEX IF NOT EXISTS idx_yahoo_data_cache_symbol ON yahoo_data_cache(symbol, data_type)"
        )
        db.execute("DROP TABLE IF EXISTS market_presets")
        db.execute("DROP TABLE IF EXISTS snapshots")
        db.execute("DROP TABLE IF EXISTS stocks")
        db.commit()
