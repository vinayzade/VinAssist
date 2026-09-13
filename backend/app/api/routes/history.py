"""
`/api/v1/history`: the user's AI activity log.

Pages are small by design; the app scrolls through them and never asks for
everything at once. Search matches title and preview; `kind` may be given
several times to combine filters.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.api.deps import ActivityDep, CurrentUser
from app.models.activity import ActivityKind, AIActivity
from app.schemas.base import PageParams, Paginated
from app.schemas.history import ActivityDetailOut, ActivityOut, ActivityUpdateIn

router = APIRouter(tags=["history"])


def page_params(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=50, alias="pageSize")
) -> PageParams:
    return PageParams(page=page, page_size=page_size)


def _kinds(raw: list[str] | None) -> list[ActivityKind]:
    """Accepts `kind=a&kind=b` and `kind=a,b` (how the app's query serialiser sends arrays)."""
    kinds: list[ActivityKind] = []
    for chunk in raw or []:
        for value in chunk.split(","):
            value = value.strip()
            if not value:
                continue
            try:
                kinds.append(ActivityKind(value))
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=f"Unknown history kind: {value}") from exc
    return kinds


def _out(row: AIActivity) -> ActivityOut:
    return ActivityOut(
        id=row.id,
        kind=row.kind.value,  # type: ignore[arg-type]
        title=row.title,
        preview=row.preview,
        favourite=row.favourite,
        ref_id=row.ref_id,
        last_activity_at=row.last_activity_at,
        created_at=row.created_at,
    )


@router.get("", response_model=Paginated[ActivityOut], summary="My AI activity, newest first")
async def list_history(
    user: CurrentUser,
    activities: ActivityDep,
    params: Annotated[PageParams, Depends(page_params)],
    kind: Annotated[list[str] | None, Query()] = None,
    favourite: bool = Query(False, description="Only favourites"),
    q: str | None = Query(None, max_length=100, description="Search title and preview"),
) -> Paginated[ActivityOut]:
    rows, total = await activities.list(
        user,
        offset=params.offset,
        limit=params.page_size,
        kinds=_kinds(kind),
        favourites_only=favourite,
        query=q,
    )
    return Paginated.build(
        [_out(r) for r in rows], page=params.page, page_size=params.page_size, total=total
    )


@router.get("/{activity_id}", response_model=ActivityDetailOut, summary="One history item")
async def get_history_item(
    activity_id: uuid.UUID, user: CurrentUser, activities: ActivityDep
) -> ActivityDetailOut:
    row = await activities.get(user, activity_id)
    return ActivityDetailOut(**_out(row).model_dump(), payload=row.payload)


@router.patch("/{activity_id}", response_model=ActivityOut, summary="Rename or favourite an item")
async def update_history_item(
    activity_id: uuid.UUID, body: ActivityUpdateIn, user: CurrentUser, activities: ActivityDep
) -> ActivityOut:
    row = await activities.update(user, activity_id, title=body.title, favourite=body.favourite)
    return _out(row)


@router.delete(
    "/{activity_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete one item"
)
async def delete_history_item(
    activity_id: uuid.UUID, user: CurrentUser, activities: ActivityDep
) -> Response:
    """Also removes the detailed result the item points at."""
    await activities.delete(user, activity_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT, summary="Clear my history")
async def clear_history(user: CurrentUser, activities: ActivityDep) -> Response:
    await activities.delete_all(user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
