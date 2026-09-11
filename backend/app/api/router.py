"""
Route registration.

`health_router` is mounted at the root so infrastructure (load balancers,
container orchestrators) can probe `/health` without knowing the API version.

`api_router` is mounted under `settings.api_prefix` (`/api/v1`), which is the
root the mobile app uses. The health routes are included here too so the app
can check connectivity through the same prefix as every other call. Feature
routers (auth, documents, history, AI) are included here as they are built.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import ai, auth, documents, health, image_quality, ocr, users

health_router = APIRouter()
health_router.include_router(health.router)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router, prefix="/auth")
api_router.include_router(users.router, prefix="/users")
api_router.include_router(documents.router, prefix="/documents")
api_router.include_router(ocr.router, prefix="/ocr")
api_router.include_router(image_quality.router, prefix="/image-quality")
api_router.include_router(ai.router, prefix="/ai")
# api_router.include_router(history.router, prefix="/history")
