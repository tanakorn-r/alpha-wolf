from __future__ import annotations

import os
import sqlite3
import threading
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


# `connect()` used to open a brand-new remote libsql/Turso connection on every single
# call (every `with connect() as db:` block), each paying a fresh TLS+auth handshake
# to Turso — with 10-15 of those per logical operation (e.g. building a dashboard),
# that overhead alone was the actual cause of ~10s request latency, not cold starts.
# The connection is opened once per process and reused for the rest of its life; a
# lock serializes access since the underlying client isn't safe for concurrent use
# from multiple threads at once (FastAPI runs sync handlers in a threadpool).
_shared_libsql_conn: LibsqlConnection | None = None
_libsql_lock = threading.Lock()


class _PooledLibsqlConnection:
    def __init__(self, conn: LibsqlConnection, lock: threading.Lock):
        self._conn = conn
        self._lock = lock

    def __enter__(self) -> LibsqlConnection:
        self._lock.acquire()
        return self._conn

    def __exit__(self, exc_type, exc, tb) -> bool:
        self._lock.release()
        return False


def _get_shared_libsql_connection() -> LibsqlConnection:
    global _shared_libsql_conn
    if _shared_libsql_conn is None:
        with _libsql_lock:
            if _shared_libsql_conn is None:
                _shared_libsql_conn = LibsqlConnection()
    return _shared_libsql_conn


class ClosingSQLiteConnection(sqlite3.Connection):
    """SQLite transaction context that also closes its file descriptor on exit."""

    def __exit__(self, exc_type, exc, tb):
        try:
            return super().__exit__(exc_type, exc, tb)
        finally:
            self.close()


def connect() -> sqlite3.Connection | LibsqlConnection:
    if DATABASE_URL and DATABASE_URL.startswith(("libsql://", "https://", "http://")):
        return _PooledLibsqlConnection(_get_shared_libsql_connection(), _libsql_lock)  # type: ignore[return-value]

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
            CREATE TABLE IF NOT EXISTS ai_response_cache (
                namespace TEXT NOT NULL,
                cache_key TEXT NOT NULL,
                payload TEXT NOT NULL,
                expires_at REAL NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY(namespace, cache_key)
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_results (
                user_id INTEGER NOT NULL,
                feature TEXT NOT NULL,
                subject TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                variant TEXT NOT NULL DEFAULT '',
                payload TEXT NOT NULL,
                model TEXT,
                generated_at TEXT NOT NULL,
                quality_status TEXT NOT NULL DEFAULT 'passed',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY(user_id, feature, subject, agent_id, variant)
            )
            """
        )
        db.execute(
            "CREATE INDEX IF NOT EXISTS idx_ai_results_user_recent ON ai_results(user_id, updated_at DESC)"
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS backtrade_jobs (
                id TEXT PRIMARY KEY,
                account_scope TEXT NOT NULL,
                payload TEXT NOT NULL,
                updated_at TEXT NOT NULL
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
            bonus INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL,
            PRIMARY KEY(user_id, period)
        )
        """
    )
    if "bonus" not in _table_columns(db, "ai_usage_monthly"):
        db.execute("ALTER TABLE ai_usage_monthly ADD COLUMN bonus INTEGER NOT NULL DEFAULT 0")
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS stripe_credit_fulfillments (
            event_key TEXT PRIMARY KEY,
            session_id TEXT NOT NULL UNIQUE,
            user_id INTEGER NOT NULL,
            credits INTEGER NOT NULL,
            amount_total INTEGER NOT NULL,
            currency TEXT NOT NULL,
            created_at TEXT NOT NULL
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

    db.execute(
        """
        CREATE TABLE IF NOT EXISTS portfolio_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            symbol TEXT NOT NULL,
            kind TEXT NOT NULL,
            shares REAL NOT NULL DEFAULT 0,
            price REAL NOT NULL DEFAULT 0,
            amount REAL NOT NULL DEFAULT 0,
            fees REAL NOT NULL DEFAULT 0,
            cost_basis REAL,
            realized_pnl REAL,
            occurred_at TEXT NOT NULL,
            source TEXT NOT NULL,
            created_at TEXT NOT NULL,
            native_currency TEXT NOT NULL DEFAULT 'USD',
            native_price REAL NOT NULL DEFAULT 0,
            native_fees REAL NOT NULL DEFAULT 0,
            fx_rate REAL NOT NULL DEFAULT 1
        )
        """
    )
    transaction_columns = _table_columns(db, "portfolio_transactions")
    if "native_currency" not in transaction_columns:
        db.execute("ALTER TABLE portfolio_transactions ADD COLUMN native_currency TEXT NOT NULL DEFAULT 'USD'")
    if "native_price" not in transaction_columns:
        db.execute("ALTER TABLE portfolio_transactions ADD COLUMN native_price REAL NOT NULL DEFAULT 0")
        db.execute("UPDATE portfolio_transactions SET native_price = price")
    if "native_fees" not in transaction_columns:
        db.execute("ALTER TABLE portfolio_transactions ADD COLUMN native_fees REAL NOT NULL DEFAULT 0")
        db.execute("UPDATE portfolio_transactions SET native_fees = fees")
    if "fx_rate" not in transaction_columns:
        db.execute("ALTER TABLE portfolio_transactions ADD COLUMN fx_rate REAL NOT NULL DEFAULT 1")
    # Before native execution fields existed, .BK prices were divided by the app's former
    # fixed 36.5 THB/USD rate in the browser. Recover the original THB execution so a Thai
    # holding is compared price-to-price in THB rather than manufacturing an FX return.
    db.execute(
        """UPDATE portfolio_transactions
           SET native_currency = 'THB', native_price = price * 36.5,
               native_fees = fees * 36.5, fx_rate = 36.5
           WHERE symbol LIKE '%.BK' AND native_currency = 'USD' AND fx_rate = 1"""
    )
    db.execute("CREATE INDEX IF NOT EXISTS idx_portfolio_transactions_user_time ON portfolio_transactions(user_id, occurred_at, id)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_portfolio_transactions_user_symbol ON portfolio_transactions(user_id, symbol, occurred_at, id)")
    # Existing aggregate positions become explicit opening lots once. This preserves every account
    # while making future buys and sells auditable; anonymous legacy rows remain inaccessible.
    db.execute(
        """
        INSERT INTO portfolio_transactions(
            user_id, symbol, kind, shares, price, amount, fees,
            native_currency, native_price, native_fees, fx_rate, cost_basis,
            realized_pnl, occurred_at, source, created_at
        )
        SELECT h.user_id, h.symbol, 'BUY', h.shares, h.average_cost,
               h.shares * h.average_cost, 0,
               CASE WHEN h.symbol LIKE '%.BK' THEN 'THB' ELSE 'USD' END,
               CASE WHEN h.symbol LIKE '%.BK' THEN h.average_cost * 36.5 ELSE h.average_cost END,
               0, CASE WHEN h.symbol LIKE '%.BK' THEN 36.5 ELSE 1 END,
               h.shares * h.average_cost,
               NULL, h.created_at, 'OPENING_BALANCE', h.created_at
        FROM holdings h
        WHERE h.user_id > 0
          AND NOT EXISTS (
              SELECT 1 FROM portfolio_transactions t
              WHERE t.user_id = h.user_id AND t.symbol = h.symbol
          )
        """
    )

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
