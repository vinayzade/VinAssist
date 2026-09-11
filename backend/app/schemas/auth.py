"""
Auth request/response models.

Field names serialise to camelCase (`accessToken`, `refreshToken`,
`createdAt`) to match the mobile client's `authApi.ts` and `userApi.ts`.
Validation messages are phrased for end users because the app shows
Pydantic's `msg` next to the offending field.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime

from pydantic import EmailStr, Field, field_validator

from app.schemas.base import CamelModel

NAME_MIN = 2
NAME_MAX = 60
PASSWORD_MIN = 8
PASSWORD_MAX = 128


def _validate_password(value: str) -> str:
    # Mirrors `rules.password()` in the app so both sides agree.
    if len(value) < PASSWORD_MIN:
        raise ValueError(f"Use at least {PASSWORD_MIN} characters")
    if len(value) > PASSWORD_MAX:
        raise ValueError(f"Use at most {PASSWORD_MAX} characters")
    if not re.search(r"[A-Za-z]", value) or not re.search(r"\d", value):
        raise ValueError("Use a mix of letters and numbers")
    return value


class UserPublic(CamelModel):
    """`User` / `UserProfile` in the app."""

    id: uuid.UUID
    name: str
    email: EmailStr
    avatar_url: str | None = None
    created_at: datetime


class RegisterRequest(CamelModel):
    name: str = Field(min_length=NAME_MIN, max_length=NAME_MAX)
    email: EmailStr
    password: str

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < NAME_MIN:
            raise ValueError("Name is too short")
        return value

    @field_validator("password")
    @classmethod
    def _password(cls, value: str) -> str:
        return _validate_password(value)


class LoginRequest(CamelModel):
    email: EmailStr
    password: str = Field(min_length=1)


class AuthResponse(CamelModel):
    """Body of register and login. The app stores both tokens securely."""

    user: UserPublic
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(CamelModel):
    refresh_token: str = Field(min_length=1)


class RefreshResponse(CamelModel):
    access_token: str
    # Always rotated: the old refresh token is revoked on use.
    refresh_token: str
    token_type: str = "bearer"


class LogoutRequest(CamelModel):
    refresh_token: str | None = None


class ForgotPasswordRequest(CamelModel):
    email: EmailStr


class ResetPasswordRequest(CamelModel):
    token: str = Field(min_length=1)
    password: str

    @field_validator("password")
    @classmethod
    def _password(cls, value: str) -> str:
        return _validate_password(value)


class ChangePasswordRequest(CamelModel):
    current_password: str = Field(min_length=1)
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _password(cls, value: str) -> str:
        return _validate_password(value)


class UpdateProfileRequest(CamelModel):
    name: str | None = Field(default=None, min_length=NAME_MIN, max_length=NAME_MAX)
    email: EmailStr | None = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None
