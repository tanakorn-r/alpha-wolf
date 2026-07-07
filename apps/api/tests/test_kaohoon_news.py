from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.news import kaohoon


class FakeResponse:
    def __init__(self, payload: object) -> None:
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> object:
        return self._payload


_SAMPLE = [
    {
        "link": "https://www.kaohooninternational.com/markets/12345",
        "date_gmt": "2026-07-07T03:39:25",
        "title": {"rendered": "Market Roundup &#8211; 7 July 2026"},
        "excerpt": {"rendered": "<p>Thailand&#8217;s SET Index closed lower.</p>\n"},
    }
]


class KaohoonNewsTests(unittest.TestCase):
    def test_fetch_parses_and_cleans_wordpress_payload(self) -> None:
        with mock.patch.object(kaohoon.requests, "get", return_value=FakeResponse(_SAMPLE)):
            news = kaohoon.fetch_kaohoon_news(5)

        self.assertEqual(news[0]["title"], "Market Roundup – 7 July 2026")
        self.assertEqual(news[0]["summary"], "Thailand’s SET Index closed lower.")
        self.assertEqual(news[0]["publisher"], "Kaohoon International")
        self.assertEqual(news[0]["link"], "https://www.kaohooninternational.com/markets/12345")
        self.assertEqual(news[0]["publishedAt"], "2026-07-07T03:39:25")

    def test_fetch_returns_empty_on_request_failure(self) -> None:
        with mock.patch.object(kaohoon.requests, "get", side_effect=RuntimeError("boom")):
            self.assertEqual(kaohoon.fetch_kaohoon_news(), [])


if __name__ == "__main__":
    unittest.main()
