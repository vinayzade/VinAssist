from __future__ import annotations

from app.database.session import check_database
from app.schemas.health import HealthResponse, ReadinessResponse


class HealthService:
    async def liveness(self) -> HealthResponse:
        return HealthResponse()

    async def readiness(self) -> ReadinessResponse:
        db_ok = await check_database()
        return ReadinessResponse(status="ready" if db_ok else "degraded", database=db_ok)
