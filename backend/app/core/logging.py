"""Console logging with one format shared by the app, uvicorn and SQLAlchemy."""

from __future__ import annotations

import logging
import sys

_FORMAT = "%(asctime)s %(levelname)-8s %(name)s [%(request_id)s] %(message)s"


class RequestIdFilter(logging.Filter):
    """Adds the current request id (see middleware.request_id) to every record."""

    def filter(self, record: logging.LogRecord) -> bool:
        from app.middleware.request_id import get_request_id

        record.request_id = get_request_id() or "-"
        return True


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(_FORMAT))
    handler.addFilter(RequestIdFilter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level.upper())

    # Route uvicorn's loggers through the root handler so the format matches.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uv = logging.getLogger(name)
        uv.handlers.clear()
        uv.propagate = True
