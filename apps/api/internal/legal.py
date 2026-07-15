from __future__ import annotations

TERMS_VERSION = "2026-07-15"
PRIVACY_VERSION = "2026-07-15"
REFUND_VERSION = "2026-07-15"


def legal_versions() -> dict[str, str]:
    return {
        "terms": TERMS_VERSION,
        "privacy": PRIVACY_VERSION,
        "refunds": REFUND_VERSION,
    }
