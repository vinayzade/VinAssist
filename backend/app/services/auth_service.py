"""
Authentication and session lifecycle.

Flows:
- register / login  -> user + access token + refresh token
- refresh           -> new pair; the presented refresh token is revoked and
                       linked to its replacement (rotation). Presenting an
                       already-revoked token means it was stolen or replayed,
                       so every session of that user is ended.
- logout            -> revoke the presented refresh token
- forgot / reset    -> signed reset token bound to the current password hash

The service never touches HTTP; routes translate `AppError`s to responses.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.exceptions import (
    AppError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
)
from app.core.security import (
    TokenError,
    create_access_token,
    create_password_reset_token,
    decode_token,
    generate_refresh_token,
    hash_password,
    hash_token,
    password_needs_rehash,
    verify_password,
)
from app.models.user import RefreshToken, User
from app.repositories.refresh_token_repository import RefreshTokenRepository
from app.repositories.user_repository import UserRepository
from app.utils.time import utcnow

logger = logging.getLogger(__name__)


class InvalidCredentialsError(UnauthorizedError):
    code = "INVALID_CREDENTIALS"
    message = "Incorrect email or password."


class EmailTakenError(ConflictError):
    code = "EMAIL_TAKEN"
    message = "An account with that email already exists."


class InvalidRefreshTokenError(UnauthorizedError):
    code = "INVALID_REFRESH_TOKEN"
    message = "Your session has expired. Please sign in again."


class InvalidResetTokenError(AppError):
    code = "INVALID_RESET_TOKEN"
    message = "This password reset link is invalid or has expired."


class AccountDisabledError(ForbiddenError):
    code = "ACCOUNT_DISABLED"
    message = "This account has been disabled."


@dataclass(frozen=True)
class ClientInfo:
    user_agent: str | None = None
    ip_address: str | None = None


@dataclass(frozen=True)
class TokenPair:
    access_token: str
    refresh_token: str


@dataclass(frozen=True)
class AuthResult:
    user: User
    tokens: TokenPair


class AuthService:
    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        self.session = session
        self.settings = settings
        self.users = UserRepository(session)
        self.refresh_tokens = RefreshTokenRepository(session)

    # --- Registration & login ------------------------------------------------

    async def register(
        self, *, name: str, email: str, password: str, client: ClientInfo
    ) -> AuthResult:
        email = email.strip().lower()
        if await self.users.email_exists(email):
            raise EmailTakenError()

        user = await self.users.add(
            User(name=name.strip(), email=email, hashed_password=hash_password(password))
        )
        user.last_login_at = utcnow()
        tokens, _ = await self._issue_tokens(user, client)
        logger.info("Registered user %s", user.id)
        return AuthResult(user=user, tokens=tokens)

    async def login(self, *, email: str, password: str, client: ClientInfo) -> AuthResult:
        user = await self.users.get_by_email(email)
        if user is None or not verify_password(password, user.hashed_password):
            # Same error for both cases so the response does not reveal
            # whether the email is registered.
            raise InvalidCredentialsError()
        if not user.is_active:
            raise AccountDisabledError()

        if password_needs_rehash(user.hashed_password):
            user.hashed_password = hash_password(password)
        user.last_login_at = utcnow()
        tokens, _ = await self._issue_tokens(user, client)
        return AuthResult(user=user, tokens=tokens)

    # --- Refresh & logout ------------------------------------------------------

    async def refresh(self, *, refresh_token: str, client: ClientInfo) -> AuthResult:
        stored = await self.refresh_tokens.get_by_hash(hash_token(refresh_token))
        if stored is None:
            raise InvalidRefreshTokenError()

        if stored.revoked_at is not None:
            # A rotated token was presented again: either the client lost the
            # rotation response, or the token was stolen. Fail closed.
            revoked = await self.refresh_tokens.revoke_all_for_user(stored.user_id)
            # The request will end in a 401, which rolls the session back.
            # The revocation is the whole point, so persist it first.
            await self.session.commit()
            logger.warning(
                "Refresh token reuse for user %s; revoked %d sessions", stored.user_id, revoked
            )
            raise InvalidRefreshTokenError()

        if stored.expires_at <= utcnow():
            await self.refresh_tokens.revoke(stored)
            raise InvalidRefreshTokenError()

        user = await self.users.get(stored.user_id)
        if user is None or not user.is_active:
            await self.refresh_tokens.revoke(stored)
            raise InvalidRefreshTokenError()

        tokens, replacement = await self._issue_tokens(user, client)
        await self.refresh_tokens.revoke(stored, replaced_by=replacement)
        return AuthResult(user=user, tokens=tokens)

    async def logout(self, *, refresh_token: str | None, user: User | None) -> None:
        """
        Revokes the presented refresh token. Idempotent and forgiving: an
        unknown token is not an error, because the client is signing out
        locally regardless.
        """
        if refresh_token:
            stored = await self.refresh_tokens.get_by_hash(hash_token(refresh_token))
            if stored is not None and stored.revoked_at is None:
                if user is None or stored.user_id == user.id:
                    await self.refresh_tokens.revoke(stored)

    async def logout_everywhere(self, user: User) -> int:
        return await self.refresh_tokens.revoke_all_for_user(user.id)

    # --- Password reset --------------------------------------------------------

    async def create_password_reset(self, *, email: str) -> str | None:
        """
        Returns the reset token for delivery, or None when the email is
        unknown. Callers must respond identically in both cases.
        """
        user = await self.users.get_by_email(email)
        if user is None or not user.is_active:
            return None
        return create_password_reset_token(
            user.id,
            password_hash=user.hashed_password,
            secret=self.settings.jwt_secret,
            algorithm=self.settings.jwt_algorithm,
            ttl=timedelta(minutes=self.settings.password_reset_ttl_minutes),
        )

    async def reset_password(self, *, token: str, new_password: str) -> User:
        try:
            claims = decode_token(
                token,
                secret=self.settings.jwt_secret,
                algorithm=self.settings.jwt_algorithm,
                purpose="password_reset",
            )
        except TokenError as exc:
            raise InvalidResetTokenError() from exc

        user = await self.users.get(uuid.UUID(claims["sub"]))
        if user is None or claims.get("pwd") != hash_token(user.hashed_password)[:16]:
            raise InvalidResetTokenError()

        user.hashed_password = hash_password(new_password)
        await self.refresh_tokens.revoke_all_for_user(user.id)
        return user

    async def change_password(
        self, *, user: User, current_password: str, new_password: str
    ) -> None:
        if not verify_password(current_password, user.hashed_password):
            raise InvalidCredentialsError("Current password is incorrect.")
        user.hashed_password = hash_password(new_password)
        await self.refresh_tokens.revoke_all_for_user(user.id)

    # --- Access tokens ---------------------------------------------------------

    async def resolve_access_token(self, token: str) -> User:
        """Maps a bearer token to an active user, or raises 401."""
        try:
            claims = decode_token(
                token,
                secret=self.settings.jwt_secret,
                algorithm=self.settings.jwt_algorithm,
                purpose="access",
            )
        except TokenError as exc:
            raise UnauthorizedError(
                "Your session has expired. Please sign in again.", code="TOKEN_INVALID"
            ) from exc
        user = await self.users.get(uuid.UUID(claims["sub"]))
        if user is None:
            raise NotFoundError("User no longer exists.", code="USER_NOT_FOUND")
        if not user.is_active:
            raise AccountDisabledError()
        return user

    # --- Internals -------------------------------------------------------------

    async def _issue_tokens(
        self, user: User, client: ClientInfo
    ) -> tuple[TokenPair, RefreshToken]:
        access = create_access_token(
            user.id,
            secret=self.settings.jwt_secret,
            algorithm=self.settings.jwt_algorithm,
            ttl=timedelta(minutes=self.settings.access_token_ttl_minutes),
        )
        raw_refresh = generate_refresh_token()
        row = await self.refresh_tokens.create(
            user_id=user.id,
            token_hash=hash_token(raw_refresh),
            expires_at=utcnow() + timedelta(days=self.settings.refresh_token_ttl_days),
            user_agent=client.user_agent,
            ip_address=client.ip_address,
        )
        return TokenPair(access_token=access, refresh_token=raw_refresh), row
