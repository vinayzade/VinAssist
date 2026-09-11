from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.base import PageParams, Paginated
from app.schemas.ocr import OcrResultDetail, OcrResultSummary, SaveOcrResultRequest
from app.services.ocr_service import OcrService

router = APIRouter(tags=["ocr"])


def get_ocr_service(db: DbSession) -> OcrService:
    return OcrService(db)


OcrServiceDep = Annotated[OcrService, Depends(get_ocr_service)]


def page_params(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100, alias="pageSize")
) -> PageParams:
    return PageParams(page=page, page_size=page_size)


@router.post(
    "/results",
    response_model=OcrResultDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Store text recognised on the device",
)
async def save_result(
    body: SaveOcrResultRequest, user: CurrentUser, service: OcrServiceDep
) -> OcrResultDetail:
    return await service.save(user, body)


@router.get("/results", response_model=Paginated[OcrResultSummary], summary="List saved results")
async def list_results(
    user: CurrentUser,
    service: OcrServiceDep,
    params: Annotated[PageParams, Depends(page_params)],
) -> Paginated[OcrResultSummary]:
    items, total = await service.list(user, offset=params.offset, limit=params.page_size)
    return Paginated.build(items, page=params.page, page_size=params.page_size, total=total)


@router.get("/results/{result_id}", response_model=OcrResultDetail, summary="One saved result")
async def get_result(
    result_id: uuid.UUID, user: CurrentUser, service: OcrServiceDep
) -> OcrResultDetail:
    return await service.get(user, result_id)


@router.delete(
    "/results/{result_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a result"
)
async def delete_result(
    result_id: uuid.UUID, user: CurrentUser, service: OcrServiceDep
) -> Response:
    await service.delete(user, result_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
