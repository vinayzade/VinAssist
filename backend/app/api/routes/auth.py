from __future__ import annotations

import logging

from fastapi import APIRouter, Response, status

from app.api.deps import AppSettings, AuthServiceDep, ClientInfoDep, OptionalUser
from app.schemas.auth import (
    AuthResponse,
    ForgotPasswordRequest,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RefreshResponse,
    RegisterRequest,
    ResetPasswordRequest,
    UserPublic,
)
from app.services.auth_service import AuthResult

logger = logging.getLogger(__name__)

router = APIRouter(tags=["auth"])


def _to_response(result: AuthResult) -> AuthResponse:
    return AuthResponse(
        user=UserPublic.model_validate(result.user),
        access_token=result.tokens.access_token,
        refresh_token=result.tokens.refresh_token,
    )


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an account and sign in",
)
async def register(
    body: RegisterRequest, auth: AuthServiceDep, client: ClientInfoDep
) -> AuthResponse:
    result = await auth.register(
        name=body.name, email=body.email, password=body.password, client=client
    )
    return _to_response(result)


@router.post("/login", response_model=AuthResponse, summary="Sign in")
async def login(body: LoginRequest, auth: AuthServiceDep, client: ClientInfoDep) -> AuthResponse:
    result = await auth.login(email=body.email, password=body.password, client=client)
    return _to_response(result)


@router.post(
    "/refresh",
    response_model=RefreshResponse,
    summary="Exchange a refresh token for a new token pair",
)
async def refresh(
    body: RefreshRequest, auth: AuthServiceDep, client: ClientInfoDep
) -> RefreshResponse:
    result = await auth.refresh(refresh_token=body.refresh_token, client=client)
    return RefreshResponse(
        access_token=result.tokens.access_token,
        refresh_token=result.tokens.refresh_token,
    )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke a refresh token",
)
async def logout(
    auth: AuthServiceDep,
    user: OptionalUser,
    body: LogoutRequest | None = None,
) -> Response:
    """
    Accepts an optional `refreshToken` in the body. Succeeds even when the
    access token has already expired, so signing out never gets stuck.
    """
    await auth.logout(refresh_token=body.refresh_token if body else None, user=user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/forgot-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Request a password reset",
)
async def forgot_password(
    body: ForgotPasswordRequest, auth: AuthServiceDep, settings: AppSettings
) -> Response:
    """
    Always returns 204 so the response does not reveal whether an email is
    registered. Until an email provider is configured, the reset token is
    written to the server log in non-production environments.
    """
    token = await auth.create_password_reset(email=body.email)
    if token is not None:
        if settings.is_production:
            # TODO: hand `token` to the email service.
            logger.info("Password reset requested for %s", body.email)
        else:
            logger.warning(
                "Password reset for %s (no email provider configured): token=%s",
                body.email,
                token,
            )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Set a new password using a reset token",
)
async def reset_password(body: ResetPasswordRequest, auth: AuthServiceDep) -> Response:
    await auth.reset_password(token=body.token, new_password=body.password)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
