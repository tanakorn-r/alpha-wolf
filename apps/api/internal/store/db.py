from __future__ import annotations

import os
import queue
import sqlite3
import threading
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "alpha_wolf.sqlite3"
DATABASE_URL = os.getenv("LIBSQL_DATABASE_URL") or os.getenv("TURSO_DATABASE_URL") or os.getenv("TURSO_URL")
DATABASE_AUTH_TOKEN = os.getenv("LIBSQL_AUTH_TOKEN") or os.getenv("TURSO_AUTH_TOKEN")
LIBSQL_POOL_SIZE = max(1, int(os.getenv("LIBSQL_POOL_SIZE", "4")))
_TERMINAL_LIBSQL_ERROR_MARKERS = (
    "stream not found",
    "stream has been closed",
    "client is closed",
)


def _is_terminal_libsql_error(exc: BaseException | None) -> bool:
    if exc is None:
        return False
    message = str(exc).lower()
    return any(marker in message for marker in _TERMINAL_LIBSQL_ERROR_MARKERS)


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
        self._conn: Any | None = None
        self._has_pending_work = False
        self._reconnect()

    @staticmethod
    def _open_connection() -> Any:
        import libsql

        return libsql.connect(
            database=DATABASE_URL,
            auth_token=DATABASE_AUTH_TOKEN or "",
        )

    def _reconnect(self) -> None:
        previous = self._conn
        self._conn = self._open_connection()
        self._has_pending_work = False
        if previous is not None:
            try:
                previous.close()
            except Exception:
                pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()
        return False

    def execute(self, sql: str, params: tuple[Any, ...] | list[Any] | None = None) -> LibsqlCursor:
        values = list(params or [])
        try:
            result = self._conn.execute(sql, values)
        except Exception as exc:
            # A Hrana stream is server-side state and may disappear while a Cloud Run
            # instance remains warm. A read (or the first statement in a unit of work)
            # is safe to replay once on a fresh stream. Never replay after a successful
            # write because doing so could split one logical transaction across streams.
            if self._has_pending_work or not _is_terminal_libsql_error(exc):
                raise
            self._reconnect()
            result = self._conn.execute(sql, values)

        if _statement_has_pending_work(sql):
            self._has_pending_work = True
        return LibsqlCursor(result)

    def commit(self) -> None:
        self._conn.commit()
        self._has_pending_work = False

    def close(self) -> None:
        connection = self._conn
        self._conn = None
        self._has_pending_work = False
        if connection is not None:
            connection.close()


def _statement_has_pending_work(sql: str) -> bool:
    statement = sql.lstrip().split(None, 1)
    if not statement:
        return False
    return statement[0].upper() not in {"SELECT", "PRAGMA", "EXPLAIN"}


# Remote connections are expensive to establish but a single shared connection turns
# concurrent FastAPI requests into one long queue. Keep a small process-lifetime pool:
# each individual libsql connection is still leased to only one thread at a time, while
# independent account/catalog/watchlist reads can proceed concurrently.
_libsql_pool: queue.LifoQueue[LibsqlConnection] = queue.LifoQueue(maxsize=LIBSQL_POOL_SIZE)
_libsql_pool_created = 0
_libsql_pool_create_lock = threading.Lock()


class _PooledLibsqlConnection:
    def __init__(self):
        self._conn: LibsqlConnection | None = None

    def __enter__(self) -> LibsqlConnection:
        self._conn = _acquire_libsql_connection()
        return self._conn

    def __exit__(self, exc_type, exc, tb) -> bool:
        if self._conn is not None:
            if _is_terminal_libsql_error(exc):
                _discard_libsql_connection(self._conn)
            else:
                _libsql_pool.put(self._conn)
            self._conn = None
        return False


def _acquire_libsql_connection() -> LibsqlConnection:
    global _libsql_pool_created
    try:
        return _libsql_pool.get_nowait()
    except queue.Empty:
        pass

    with _libsql_pool_create_lock:
        if _libsql_pool_created < LIBSQL_POOL_SIZE:
            connection = LibsqlConnection()
            _libsql_pool_created += 1
            return connection

    return _libsql_pool.get()


def _discard_libsql_connection(connection: LibsqlConnection) -> None:
    global _libsql_pool_created
    try:
        connection.close()
    except Exception:
        # Preserve the original database exception that caused eviction.
        pass
    finally:
        with _libsql_pool_create_lock:
            _libsql_pool_created = max(0, _libsql_pool_created - 1)


class ClosingSQLiteConnection(sqlite3.Connection):
    """SQLite transaction context that also closes its file descriptor on exit."""

    def __exit__(self, exc_type, exc, tb):
        try:
            return super().__exit__(exc_type, exc, tb)
        finally:
            self.close()


def connect() -> sqlite3.Connection | LibsqlConnection:
    if DATABASE_URL and DATABASE_URL.startswith(("libsql://", "https://", "http://")):
        return _PooledLibsqlConnection()  # type: ignore[return-value]

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
            CREATE TABLE IF NOT EXISTS ai_run_audit (
                run_id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                feature TEXT NOT NULL,
                subject TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                variant TEXT NOT NULL DEFAULT '',
                model TEXT,
                prompt_version TEXT NOT NULL,
                source_timestamps TEXT NOT NULL,
                input_payload TEXT NOT NULL,
                raw_output TEXT NOT NULL,
                guarded_output TEXT NOT NULL,
                decision_state TEXT NOT NULL,
                quality_checks TEXT NOT NULL,
                status TEXT NOT NULL,
                error TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        db.execute("CREATE INDEX IF NOT EXISTS idx_ai_run_audit_user_recent ON ai_run_audit(user_id, created_at DESC)")
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS backtrade_jobs (
                id TEXT PRIMARY KEY,
                account_scope TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'queued',
                lease_owner TEXT,
                lease_expires_at TEXT,
                attempts INTEGER NOT NULL DEFAULT 0,
                payload TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        backtrade_columns = _table_columns(db, "backtrade_jobs")
        for name, definition in (
            ("status", "TEXT NOT NULL DEFAULT 'queued'"),
            ("lease_owner", "TEXT"),
            ("lease_expires_at", "TEXT"),
            ("attempts", "INTEGER NOT NULL DEFAULT 0"),
        ):
            if name not in backtrade_columns:
                db.execute(f"ALTER TABLE backtrade_jobs ADD COLUMN {name} {definition}")
        db.execute("CREATE INDEX IF NOT EXISTS idx_backtrade_jobs_queue ON backtrade_jobs(status, lease_expires_at, updated_at)")
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
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS operational_telemetry_daily (
                day TEXT NOT NULL,
                event TEXT NOT NULL,
                dimension TEXT NOT NULL DEFAULT '',
                outcome TEXT NOT NULL DEFAULT '',
                method TEXT NOT NULL DEFAULT '',
                status_group TEXT NOT NULL DEFAULT '',
                duration_bucket TEXT NOT NULL DEFAULT '',
                event_count INTEGER NOT NULL DEFAULT 0,
                total_duration_ms INTEGER NOT NULL DEFAULT 0,
                max_duration_ms INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY(day, event, dimension, outcome, method, status_group, duration_bucket)
            )
            """
        )
        db.execute("CREATE INDEX IF NOT EXISTS idx_operational_telemetry_day ON operational_telemetry_daily(day DESC)")
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
        CREATE TABLE IF NOT EXISTS user_settings (
            user_id INTEGER PRIMARY KEY,
            country_code TEXT NOT NULL,
            display_language TEXT NOT NULL,
            base_currency TEXT NOT NULL,
            timezone TEXT NOT NULL,
            date_locale TEXT NOT NULL,
            number_locale TEXT NOT NULL,
            preferred_markets TEXT NOT NULL,
            completed_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS ai_credit_balances (
            user_id INTEGER PRIMARY KEY,
            balance INTEGER NOT NULL DEFAULT 0,
            used_total INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL
        )
        """
    )
    if "used_total" not in _table_columns(db, "ai_credit_balances"):
        db.execute("ALTER TABLE ai_credit_balances ADD COLUMN used_total INTEGER NOT NULL DEFAULT 0")
    # Older releases attached paid credits to one calendar month's usage row. Move
    # every legacy bonus into the durable balance exactly once, then remove the
    # calendar-month ledger entirely so it can never reset or be used again.
    legacy_usage_columns = _table_columns(db, "ai_usage_monthly")
    if legacy_usage_columns:
        legacy_bonus_rows = db.execute(
            "SELECT user_id, SUM(bonus) FROM ai_usage_monthly WHERE bonus > 0 GROUP BY user_id"
        ).fetchall() if "bonus" in legacy_usage_columns else []
        for row in legacy_bonus_rows:
            db.execute(
                """INSERT INTO ai_credit_balances(user_id, balance, used_total, updated_at) VALUES(?, ?, 0, CURRENT_TIMESTAMP)
                   ON CONFLICT(user_id) DO UPDATE SET balance = ai_credit_balances.balance + excluded.balance,
                   updated_at = excluded.updated_at""",
                (int(row[0]), int(row[1])),
            )
        db.execute("DROP TABLE ai_usage_monthly")
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
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS legal_acceptances (
            user_id INTEGER NOT NULL,
            document TEXT NOT NULL,
            version TEXT NOT NULL,
            accepted_at TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'legacy',
            PRIMARY KEY(user_id, document, version)
        )
        """
    )
    legal_acceptance_columns = _table_columns(db, "legal_acceptances")
    if "source" not in legal_acceptance_columns:
        db.execute("ALTER TABLE legal_acceptances ADD COLUMN source TEXT NOT NULL DEFAULT 'legacy'")
    # Acceptance rows are append-only evidence. UPDATE is always forbidden, and an
    # acceptance cannot be deleted while its owning account still exists. The account
    # erasure workflow removes the user first and then clears these now-orphaned stamps.
    db.execute(
        """
        CREATE TRIGGER IF NOT EXISTS legal_acceptances_no_update
        BEFORE UPDATE ON legal_acceptances
        BEGIN
            SELECT RAISE(ABORT, 'legal acceptance records are immutable');
        END
        """
    )
    db.execute(
        """
        CREATE TRIGGER IF NOT EXISTS legal_acceptances_no_delete_active_user
        BEFORE DELETE ON legal_acceptances
        WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
        BEGIN
            SELECT RAISE(ABORT, 'legal acceptance records are immutable while the account exists');
        END
        """
    )
    db.execute("CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user ON legal_acceptances(user_id, accepted_at)")
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS support_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            email TEXT NOT NULL,
            category TEXT NOT NULL,
            subject TEXT NOT NULL,
            message TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            created_at TEXT NOT NULL
        )
        """
    )
    db.execute("CREATE INDEX IF NOT EXISTS idx_support_requests_user ON support_requests(user_id, created_at)")
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            kind TEXT NOT NULL,
            subject TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            dedupe_key TEXT NOT NULL,
            metadata TEXT NOT NULL DEFAULT '{}',
            read_at TEXT,
            created_at TEXT NOT NULL,
            UNIQUE(user_id, dedupe_key)
        )
        """
    )
    db.execute("CREATE INDEX IF NOT EXISTS idx_notifications_user_recent ON notifications(user_id, read_at, created_at DESC)")

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
