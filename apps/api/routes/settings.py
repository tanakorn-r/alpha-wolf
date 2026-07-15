from __future__ import annotations

from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from internal.auth_context import require_user_id
from internal.store.settings import load_user_settings, save_user_settings

router = APIRouter(prefix="/api/settings", tags=["settings"])

MarketKey = Literal["us", "europe", "japan", "hong-kong-china", "thailand"]


class LocaleSettingsInput(BaseModel):
    countryCode: str = Field(min_length=2, max_length=2, pattern="^[A-Z]{2}$")
    displayLanguage: str = Field(min_length=2, max_length=20)
    baseCurrency: Literal["USD", "THB", "EUR", "GBP", "JPY", "HKD", "CNY"]
    timezone: str = Field(min_length=1, max_length=64)
    dateLocale: str = Field(min_length=2, max_length=20)
    numberLocale: str = Field(min_length=2, max_length=20)
    preferredMarkets: list[MarketKey] = Field(min_length=1, max_length=5)

    @field_validator("preferredMarkets")
    @classmethod
    def unique_markets(cls, value: list[MarketKey]) -> list[MarketKey]:
        return list(dict.fromkeys(value))

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise ValueError("Unknown timezone") from exc
        return value


@router.get("")
def get_settings(request: Request) -> dict:
    return {"settings": load_user_settings(require_user_id(request))}


@router.put("")
def put_settings(payload: LocaleSettingsInput, request: Request) -> dict:
    user_id = require_user_id(request)
    try:
        settings = save_user_settings(
            user_id,
            country_code=payload.countryCode,
            display_language=payload.displayLanguage,
            base_currency=payload.baseCurrency,
            timezone_name=payload.timezone,
            date_locale=payload.dateLocale,
            number_locale=payload.numberLocale,
            preferred_markets=list(payload.preferredMarkets),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"settings": settings}
