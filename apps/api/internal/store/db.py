from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "alpha_wolf.sqlite3"
DATABASE_URL = os.getenv("LIBSQL_DATABASE_URL") or os.getenv("TURSO_DATABASE_URL")
DATABASE_AUTH_TOKEN = os.getenv("LIBSQL_AUTH_TOKEN") or os.getenv("TURSO_AUTH_TOKEN")


class LibsqlCursor:
    def __init__(self, result: Any):
        self._result = result
        self.lastrowid = getattr(result, "last_insert_rowid", None)

    def fetchone(self):
        rows = getattr(self._result, "rows", [])
        return rows[0] if rows else None

    def fetchall(self):
        return list(getattr(self._result, "rows", []))


class LibsqlConnection:
    def __init__(self):
        import libsql_client

        kwargs = {"auth_token": DATABASE_AUTH_TOKEN} if DATABASE_AUTH_TOKEN else {}
        self._client = libsql_client.create_client_sync(DATABASE_URL, **kwargs)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()
        return False

    def execute(self, sql: str, params: tuple[Any, ...] | list[Any] | None = None) -> LibsqlCursor:
        return LibsqlCursor(self._client.execute(sql, list(params or [])))

    def commit(self) -> None:
        # Remote libSQL statements are autocommitted unless an explicit
        # transaction is used. The store layer only needs sqlite-compatible API.
        return None

    def close(self) -> None:
        self._client.close()


def connect() -> sqlite3.Connection | LibsqlConnection:
    if DATABASE_URL and DATABASE_URL.startswith(("libsql://", "https://", "http://")):
        return LibsqlConnection()

    db = sqlite3.connect(DB_PATH)
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
        db.execute("DROP TABLE IF EXISTS market_presets")
        db.execute("DROP TABLE IF EXISTS snapshots")
        db.execute("DROP TABLE IF EXISTS stocks")
        db.commit()
