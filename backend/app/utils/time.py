from __future__ import annotations

from datetime import datetime, timezone


def utcnow() -> datetime:
    """Timezone-aware UTC now. Naive datetimes are never stored."""
    return datetime.now(timezone.utc)
