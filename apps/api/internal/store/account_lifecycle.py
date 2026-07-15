from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from internal.legal import PRIVACY_VERSION, TERMS_VERSION
from internal.store.db import connect


def record_current_legal_acceptance(user_id: int, *, source: str = "account_settings") -> None:
    """Append immutable stamps for both current legal documents; repeated calls are idempotent."""
    now = datetime.now(timezone.utc).isoformat()
    with connect() as db:
        for document, version in (("terms", TERMS_VERSION), ("privacy", PRIVACY_VERSION)):
            db.execute(
                "INSERT OR IGNORE INTO legal_acceptances(user_id, document, version, accepted_at, source) VALUES(?, ?, ?, ?, ?)",
                (user_id, document, version, now, source),
            )
        db.commit()


def legal_acceptance_status(user_id: int) -> dict[str, Any]:
    with connect() as db:
        rows = db.execute(
            "SELECT document, version, accepted_at FROM legal_acceptances WHERE user_id = ? ORDER BY accepted_at",
            (user_id,),
        ).fetchall()
    accepted = {(str(row[0]), str(row[1])) for row in rows}
    current = ("terms", TERMS_VERSION) in accepted and ("privacy", PRIVACY_VERSION) in accepted
    return {
        "legalAccepted": current,
        "legalAcceptedAt": max((str(row[2]) for row in rows), default=None),
        "termsVersion": TERMS_VERSION,
        "privacyVersion": PRIVACY_VERSION,
    }


def create_support_request(*, user_id: int | None, email: str, category: str, subject: str, message: str) -> int:
    now = datetime.now(timezone.utc).isoformat()
    with connect() as db:
        cursor = db.execute(
            "INSERT INTO support_requests(user_id, email, category, subject, message, status, created_at) VALUES(?, ?, ?, ?, ?, 'open', ?)",
            (user_id, email.strip().lower(), category, subject.strip(), message.strip(), now),
        )
        request_id = int(cursor.lastrowid or 0)
        db.commit()
    return request_id


def export_account_data(user_id: int) -> dict[str, Any]:
    with connect() as db:
        user = _one(db, "SELECT id, google_sub, email, name, picture_url, created_at, updated_at, premium_redeemed_at, premium_expires_at FROM users WHERE id = ?", (user_id,))
        if not user:
            raise LookupError("Account not found")
        return {
            "exportedAt": datetime.now(timezone.utc).isoformat(),
            "profile": _row(user),
            "legalAcceptances": _rows(db, "SELECT document, version, accepted_at, source FROM legal_acceptances WHERE user_id = ? ORDER BY accepted_at", (user_id,)),
            "settings": _row(_one(db, "SELECT country_code, display_language, base_currency, timezone, date_locale, number_locale, preferred_markets, completed_at, updated_at FROM user_settings WHERE user_id = ?", (user_id,))),
            "aiCredits": _row(_one(db, "SELECT balance, used_total, updated_at FROM ai_credit_balances WHERE user_id = ?", (user_id,))),
            "holdings": _rows(db, "SELECT symbol, shares, average_cost, strategy, monthly_dca, created_at FROM holdings WHERE user_id = ? ORDER BY symbol", (user_id,)),
            "transactions": _rows(db, "SELECT symbol, kind, shares, native_currency, native_price, native_fees, amount, cost_basis, realized_pnl, occurred_at, source, created_at FROM portfolio_transactions WHERE user_id = ? ORDER BY occurred_at, id", (user_id,)),
            "dcaOrders": _rows(db, "SELECT symbol, amount, scheduled_for, strategy, status, executed_price, shares, created_at FROM dca_orders WHERE user_id = ? ORDER BY scheduled_for, id", (user_id,)),
            "watchlist": _rows(db, "SELECT symbol, created_at FROM portfolio_watchlist WHERE user_id = ? ORDER BY created_at", (user_id,)),
            "aiResults": _rows(db, "SELECT feature, subject, agent_id, variant, payload, model, generated_at, quality_status, created_at, updated_at FROM ai_results WHERE user_id = ? ORDER BY updated_at", (user_id,)),
            "aiRunAudit": _rows(db, "SELECT run_id, feature, subject, agent_id, variant, model, prompt_version, source_timestamps, input_payload, raw_output, guarded_output, decision_state, quality_checks, status, error, created_at FROM ai_run_audit WHERE user_id = ? ORDER BY created_at", (user_id,)),
            "notifications": _rows(db, "SELECT id, kind, subject, title, message, metadata, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at", (user_id,)),
            "creditPurchases": _rows(db, "SELECT session_id, credits, amount_total, currency, created_at FROM stripe_credit_fulfillments WHERE user_id = ? ORDER BY created_at", (user_id,)),
            "supportRequests": _rows(db, "SELECT id, category, subject, message, status, created_at FROM support_requests WHERE user_id = ? ORDER BY created_at", (user_id,)),
            "backtradeJobs": _rows(db, "SELECT id, payload, updated_at FROM backtrade_jobs WHERE account_scope = ? ORDER BY updated_at", (f"user:{user_id}",)),
        }


def delete_account_data(user_id: int) -> None:
    scope = f"user:{user_id}"
    with connect() as db:
        # Account-owned content is removed explicitly because remote libsql deployments do not
        # guarantee that SQLite foreign-key cascades are enabled on every connection.
        for table in (
            "auth_sessions", "user_settings", "ai_credit_balances", "stripe_credit_fulfillments",
            "holdings", "portfolio_transactions", "dca_orders", "portfolio_watchlist", "ai_results", "ai_run_audit", "notifications", "support_requests",
        ):
            db.execute(f"DELETE FROM {table} WHERE user_id = ?", (user_id,))
        db.execute("DELETE FROM backtrade_jobs WHERE account_scope = ?", (scope,))
        db.execute("DELETE FROM ai_response_cache WHERE cache_key LIKE ?", (f"{scope}:%",))
        db.execute("DELETE FROM users WHERE id = ?", (user_id,))
        # The immutability trigger permits this only after the owning account is gone.
        db.execute("DELETE FROM legal_acceptances WHERE user_id = ?", (user_id,))
        db.commit()


def _one(db, sql: str, params: tuple[Any, ...]):
    return db.execute(sql, params).fetchone()


def _rows(db, sql: str, params: tuple[Any, ...]) -> list[dict[str, Any]]:
    return [_row(row) for row in db.execute(sql, params).fetchall()]


def _row(row) -> dict[str, Any] | None:
    if row is None:
        return None
    if hasattr(row, "keys"):
        return {str(key): row[key] for key in row.keys()}
    return {str(index): value for index, value in enumerate(row)}
