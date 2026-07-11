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
        self.rowcount = int(getattr(result, "rows_affected", getattr(result, "rowcount", -1)) or 0)

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
                user_id INTEGER NOT NULL DEFAULT 0,
                symbol TEXT NOT NULL,
                shares REAL NOT NULL,
                average_cost REAL NOT NULL,
                strategy TEXT NOT NULL,
                monthly_dca REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                UNIQUE(user_id, symbol)
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS dca_orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL DEFAULT 0,
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
            CREATE TABLE IF NOT EXISTS portfolio_watchlist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL DEFAULT 0,
                symbol TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(user_id, symbol)
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
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS market_calendar_cache (
                cache_key TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                fetched_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                google_sub TEXT NOT NULL UNIQUE,
                email TEXT NOT NULL,
                name TEXT NOT NULL,
                picture_url TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        db.execute("CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id)")
        _migrate_account_tables(db)
        db.execute("DROP TABLE IF EXISTS market_presets")
        db.execute("DROP TABLE IF EXISTS snapshots")
        db.execute("DROP TABLE IF EXISTS stocks")
        db.commit()


def _migrate_account_tables(db: sqlite3.Connection | LibsqlConnection) -> None:
    if "premium_redeemed_at" not in _table_columns(db, "users"):
        db.execute("ALTER TABLE users ADD COLUMN premium_redeemed_at TEXT")
    if "premium_expires_at" not in _table_columns(db, "users"):
        db.execute("ALTER TABLE users ADD COLUMN premium_expires_at TEXT")
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS ai_usage_monthly (
            user_id INTEGER NOT NULL,
            period TEXT NOT NULL,
            used INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL,
            PRIMARY KEY(user_id, period)
        )
        """
    )

    holding_columns = _table_columns(db, "holdings")
    if "user_id" not in holding_columns:
        db.execute("ALTER TABLE holdings RENAME TO holdings_legacy")
        db.execute(
            """
            CREATE TABLE holdings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL DEFAULT 0,
                symbol TEXT NOT NULL,
                shares REAL NOT NULL,
                average_cost REAL NOT NULL,
                strategy TEXT NOT NULL,
                monthly_dca REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                UNIQUE(user_id, symbol)
            )
            """
        )
        db.execute(
            """
            INSERT INTO holdings(id, user_id, symbol, shares, average_cost, strategy, monthly_dca, created_at)
            SELECT id, 0, symbol, shares, average_cost, strategy, monthly_dca, created_at
            FROM holdings_legacy
            """
        )
        db.execute("DROP TABLE holdings_legacy")
    else:
        db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_holdings_user_symbol ON holdings(user_id, symbol)")

    order_columns = _table_columns(db, "dca_orders")
    if "user_id" not in order_columns:
        db.execute("ALTER TABLE dca_orders RENAME TO dca_orders_legacy")
        db.execute(
            """
            CREATE TABLE dca_orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL DEFAULT 0,
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
            INSERT INTO dca_orders(id, user_id, symbol, amount, scheduled_for, strategy, status, executed_price, shares, created_at)
            SELECT id, 0, symbol, amount, scheduled_for, strategy, status, executed_price, shares, created_at
            FROM dca_orders_legacy
            """
        )
        db.execute("DROP TABLE dca_orders_legacy")
    db.execute("CREATE INDEX IF NOT EXISTS idx_dca_orders_user ON dca_orders(user_id, scheduled_for, id)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_portfolio_watchlist_user ON portfolio_watchlist(user_id, created_at, id)")


def _table_columns(db: sqlite3.Connection | LibsqlConnection, table: str) -> set[str]:
    rows = db.execute(f"PRAGMA table_info({table})").fetchall()
    columns: set[str] = set()
    for row in rows:
        try:
            columns.add(str(row["name"]))
        except Exception:
            columns.add(str(row[1]))
    return columns
