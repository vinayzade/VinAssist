"""Middleware registration. Order matters: the first added runs outermost."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import Settings
from app.middleware.request_id import RequestIdMiddleware
from app.middleware.timing import TimingMiddleware


def register_middleware(app: FastAPI, settings: Settings) -> None:
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
            expose_headers=["X-Request-ID", "X-Response-Time"],
        )
    app.add_middleware(TimingMiddleware)
    app.add_middleware(RequestIdMiddleware)
