from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from internal.store.db import connect


def load_user_settings(user_id: int) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute(
            """SELECT country_code, display_language, base_currency, timezone,
                      date_locale, number_locale, preferred_markets, completed_at, updated_at
               FROM user_settings WHERE user_id = ?""",
            (user_id,),
        ).fetchone()
    return _settings(row) if row else None


def save_user_settings(
    user_id: int,
    *,
    country_code: str,
    display_language: str,
    base_currency: str,
    timezone_name: str,
    date_locale: str,
    number_locale: str,
    preferred_markets: list[str],
) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    with connect() as db:
        db.execute(
            """INSERT INTO user_settings(
                   user_id, country_code, display_language, base_currency, timezone,
                   date_locale, number_locale, preferred_markets, completed_at, updated_at
               ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id) DO UPDATE SET
                   country_code = excluded.country_code,
                   display_language = excluded.display_language,
                   base_currency = excluded.base_currency,
                   timezone = excluded.timezone,
                   date_locale = excluded.date_locale,
                   number_locale = excluded.number_locale,
                   preferred_markets = excluded.preferred_markets,
                   updated_at = excluded.updated_at""",
            (
                user_id,
                country_code,
                display_language,
                base_currency,
                timezone_name,
                date_locale,
                number_locale,
                json.dumps(preferred_markets),
                now,
                now,
            ),
        )
        row = db.execute(
            """SELECT country_code, display_language, base_currency, timezone,
                      date_locale, number_locale, preferred_markets, completed_at, updated_at
               FROM user_settings WHERE user_id = ?""",
            (user_id,),
        ).fetchone()
        db.commit()
    return _settings(row)


def _settings(row: Any) -> dict[str, Any]:
    try:
        markets = json.loads(str(row[6]))
    except (TypeError, ValueError, json.JSONDecodeError):
        markets = []
    return {
        "countryCode": str(row[0]),
        "displayLanguage": str(row[1]),
        "baseCurrency": str(row[2]),
        "timezone": str(row[3]),
        "dateLocale": str(row[4]),
        "numberLocale": str(row[5]),
        "preferredMarkets": [str(value) for value in markets] if isinstance(markets, list) else [],
        "completedAt": str(row[7]),
        "updatedAt": str(row[8]),
    }
