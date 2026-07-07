from __future__ import annotations

import html
import re
from typing import Any

import requests

from internal.store.cache import cache_get, cache_set
from internal.store.utils import normalize_timestamp

# Kaohoon International runs on WordPress; its public REST API returns posts as
# JSON with HTML-wrapped title/excerpt fields we have to unwrap ourselves.
_POSTS_URL = "https://www.kaohooninternational.com/wp-json/wp/v2/posts"
_PUBLISHER = "Kaohoon International"
# WordPress blocks the default python-requests UA; a browser UA gets served.
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}
_TAG_RE = re.compile(r"<[^>]+>")

_CACHE_NAMESPACE = "kaohoon_news"
# The SET feed refreshes a few times an hour; one shared pull serves every
# ticker/page so we don't hammer WordPress on each stock-detail request.
_CACHE_TTL_SECONDS = 900


def market_news(limit: int = 5) -> list[dict[str, Any]]:
    """Cached entrypoint for the shared Thai-market feed."""
    cached = cache_get(_CACHE_NAMESPACE, str(limit))
    if cached is not None:
        return cached
    items = fetch_kaohoon_news(limit)
    if items:
        cache_set(_CACHE_NAMESPACE, str(limit), items, _CACHE_TTL_SECONDS)
    return items


def fetch_kaohoon_news(limit: int = 5) -> list[dict[str, Any]]:
    try:
        response = requests.get(
            _POSTS_URL,
            params={"per_page": limit, "_embed": 1},
            headers=_HEADERS,
            timeout=10,
        )
        response.raise_for_status()
        articles = response.json()
    except Exception:
        return []

    if not isinstance(articles, list):
        return []

    news_items: list[dict[str, Any]] = []
    for article in articles:
        if not isinstance(article, dict):
            continue
        title = _rendered_text(article.get("title"))
        if not title:
            continue
        news_items.append(
            {
                "title": title,
                "link": article.get("link"),
                "publisher": _PUBLISHER,
                "publishedAt": normalize_timestamp(
                    article.get("date_gmt") or article.get("date")
                ),
                "summary": _rendered_text(article.get("excerpt")) or None,
            }
        )
    return news_items


def _rendered_text(field: Any) -> str | None:
    """WordPress wraps title/excerpt as {'rendered': '<p>..</p>'} HTML."""
    if not isinstance(field, dict):
        return None
    raw = field.get("rendered")
    if not isinstance(raw, str):
        return None
    text = html.unescape(_TAG_RE.sub("", raw)).strip()
    return text or None
