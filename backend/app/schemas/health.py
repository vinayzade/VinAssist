from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Liveness: the process is up and serving requests."""

    status: Literal["healthy"] = "healthy"


class ReadinessResponse(BaseModel):
    """Readiness: the process can actually do work (database reachable)."""

    status: Literal["ready", "degraded"]
    database: bool
