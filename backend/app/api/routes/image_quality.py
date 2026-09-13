from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.api.deps import ActivityDep, CurrentUser, DbSession
from app.models.activity import ActivityKind
from app.api.routes.ocr import page_params
from app.schemas.base import PageParams, Paginated
from app.schemas.image_quality import ImageQualitySummary, SaveImageQualityRequest
from app.services.image_quality_service import ImageQualityService

router = APIRouter(tags=["image-quality"])


def get_service(db: DbSession) -> ImageQualityService:
    return ImageQualityService(db)


ServiceDep = Annotated[ImageQualityService, Depends(get_service)]


@router.post(
    "/results",
    response_model=ImageQualitySummary,
    status_code=status.HTTP_201_CREATED,
    summary="Store a quality report computed on the device",
)
async def save_result(
    body: SaveImageQualityRequest, user: CurrentUser, service: ServiceDep, activities: ActivityDep
) -> ImageQualitySummary:
    result = await service.save(user, body)
    await activities.record(
        user,
        ActivityKind.IMAGE_QUALITY,
        title=f"{body.status.capitalize()} · {body.overall_score}/100",
        preview=body.recommendation or ", ".join(body.warnings) or "No issues found.",
        ref_id=result.id,
        payload={
            "overallScore": body.overall_score,
            "status": body.status,
            "blurScore": body.blur_score,
            "brightnessScore": body.brightness_score,
            "resolutionScore": body.resolution_score,
            "faceScore": body.face_score,
            "faceCount": body.face_count,
            "warnings": body.warnings,
            "recommendation": body.recommendation,
            "engine": body.engine,
        },
    )
    return result


@router.get("/results", response_model=Paginated[ImageQualitySummary], summary="List reports")
async def list_results(
    user: CurrentUser,
    service: ServiceDep,
    params: Annotated[PageParams, Depends(page_params)],
) -> Paginated[ImageQualitySummary]:
    items, total = await service.list(user, offset=params.offset, limit=params.page_size)
    return Paginated.build(items, page=params.page, page_size=params.page_size, total=total)


@router.delete(
    "/results/{result_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a report"
)
async def delete_result(result_id: uuid.UUID, user: CurrentUser, service: ServiceDep) -> Response:
    await service.delete(user, result_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
