from __future__ import annotations

from fastapi import APIRouter, Response, status

from app.api.deps import AuthServiceDep, CurrentUser, DbSession
from app.core.exceptions import ConflictError
from app.repositories.user_repository import UserRepository
from app.schemas.auth import ChangePasswordRequest, UpdateProfileRequest, UserPublic

router = APIRouter(tags=["users"])


@router.get("/me", response_model=UserPublic, summary="The signed-in user")
async def get_me(user: CurrentUser) -> UserPublic:
    return UserPublic.model_validate(user)


@router.patch("/me", response_model=UserPublic, summary="Update name or email")
async def update_me(body: UpdateProfileRequest, user: CurrentUser, db: DbSession) -> UserPublic:
    users = UserRepository(db)
    if body.email is not None and body.email.lower() != user.email.lower():
        if await users.email_exists(body.email):
            raise ConflictError("An account with that email already exists.", code="EMAIL_TAKEN")
        user.email = body.email.lower()
        user.email_verified_at = None
    if body.name is not None:
        user.name = body.name
    await db.flush()
    return UserPublic.model_validate(user)


@router.post(
    "/me/password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Change password (signs out other devices)",
)
async def change_password(
    body: ChangePasswordRequest, user: CurrentUser, auth: AuthServiceDep
) -> Response:
    await auth.change_password(
        user=user, current_password=body.current_password, new_password=body.new_password
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT, summary="Delete the account")
async def delete_me(user: CurrentUser, db: DbSession) -> Response:
    """Hard delete; every owned row cascades at the database level."""
    await db.delete(user)
    await db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
