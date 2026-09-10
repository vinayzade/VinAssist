from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import HealthServiceDep
from app.schemas.health import HealthResponse, ReadinessResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse, summary="Liveness probe")
async def health(service: HealthServiceDep) -> HealthResponse:
    """Returns `{"status": "healthy"}` whenever the process is serving requests."""
    return await service.liveness()


@router.get("/ready", response_model=ReadinessResponse, summary="Readiness probe")
async def ready(service: HealthServiceDep) -> ReadinessResponse:
    """Reports whether dependencies (currently the database) are reachable."""
    return await service.readiness()
