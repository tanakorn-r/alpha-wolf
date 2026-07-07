from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.yahoo.client import fetch_news


class FakeTicker:
    news = [
        {
            "content": {
                "title": "Apple plans new iPhones",
                "summary": "A busy release cycle could affect Apple.",
                "pubDate": "2026-07-04T20:37:00Z",
                "provider": {"displayName": "Motley Fool"},
                "clickThroughUrl": {"url": "https://finance.yahoo.com/news/apple"},
            }
        }
    ]


class LegacyFakeTicker:
    news = [
        {
            "title": "Legacy title",
            "summary": "Legacy summary",
            "providerPublishTime": 1_783_196_220,
            "publisher": "Yahoo Finance",
            "link": "https://finance.yahoo.com/news/legacy",
        }
    ]


class YahooNewsTests(unittest.TestCase):
    def test_fetch_news_parses_nested_yfinance_content_payload(self) -> None:
        news = fetch_news(FakeTicker())

        self.assertEqual(news[0]["title"], "Apple plans new iPhones")
        self.assertEqual(news[0]["summary"], "A busy release cycle could affect Apple.")
        self.assertEqual(news[0]["publisher"], "Motley Fool")
        self.assertEqual(news[0]["link"], "https://finance.yahoo.com/news/apple")
        self.assertEqual(news[0]["publishedAt"], "2026-07-04T20:37:00+00:00")

    def test_fetch_news_keeps_legacy_flat_payload_support(self) -> None:
        news = fetch_news(LegacyFakeTicker())

        self.assertEqual(news[0]["title"], "Legacy title")
        self.assertEqual(news[0]["publisher"], "Yahoo Finance")
        self.assertEqual(news[0]["link"], "https://finance.yahoo.com/news/legacy")
        self.assertIsNotNone(news[0]["publishedAt"])


if __name__ == "__main__":
    unittest.main()
