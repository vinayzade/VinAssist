"""
Shared FastAPI dependencies.

Route handlers declare what they need (`DbSession`, a service, ...) and this
module wires it up, so handlers stay thin and services stay constructible
without FastAPI in tests.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.database.session import get_db
from app.services.health import HealthService

DbSession = Annotated[AsyncSession, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings)]


def get_health_service() -> HealthService:
    return HealthService()


HealthServiceDep = Annotated[HealthService, Depends(get_health_service)]
