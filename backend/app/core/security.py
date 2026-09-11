"""
Password hashing and token primitives. No I/O, no framework imports, so it
is trivially unit-testable and reusable from CLI scripts.

- Passwords: Argon2id via argon2-cffi (memory-hard, the current OWASP
  recommendation). Hashes carry their parameters, so they can be upgraded
  transparently via `needs_rehash`.
- Access tokens: short-lived HS256 JWTs carrying the user id as `sub`.
- Refresh tokens: opaque 256-bit random strings. Only their SHA-256 hash is
  stored (see models.RefreshToken), so a database leak cannot be replayed.
- Password-reset tokens: JWTs bound to the current password hash, which
  makes them single-use without a table: once the password changes the
  fingerprint no longer matches.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

_hasher = PasswordHasher()

TokenPurpose = Literal["access", "password_reset"]


# --- Passwords -------------------------------------------------------------


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return _hasher.verify(hashed, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def password_needs_rehash(hashed: str) -> bool:
    return _hasher.check_needs_rehash(hashed)


# --- Opaque tokens -----------------------------------------------------------


def generate_refresh_token() -> str:
    """URL-safe, 256 bits of entropy. Sent to the client exactly once."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Deterministic fingerprint for lookup; the raw token is never stored."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# --- JWTs ----------------------------------------------------------------------


class TokenError(Exception):
    """The token is malformed, expired, or issued for another purpose."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(
    user_id: uuid.UUID, *, secret: str, algorithm: str, ttl: timedelta
) -> str:
    now = _now()
    claims: dict[str, Any] = {
        "sub": str(user_id),
        "purpose": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(claims, secret, algorithm=algorithm)


def create_password_reset_token(
    user_id: uuid.UUID,
    *,
    password_hash: str,
    secret: str,
    algorithm: str,
    ttl: timedelta,
) -> str:
    now = _now()
    claims: dict[str, Any] = {
        "sub": str(user_id),
        "purpose": "password_reset",
        # Fingerprint of the current hash: changing the password invalidates
        # every outstanding reset token for that user.
        "pwd": hash_token(password_hash)[:16],
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
    }
    return jwt.encode(claims, secret, algorithm=algorithm)


def decode_token(
    token: str, *, secret: str, algorithm: str, purpose: TokenPurpose
) -> dict[str, Any]:
    try:
        claims = jwt.decode(
            token,
            secret,
            algorithms=[algorithm],
            options={"require": ["sub", "exp", "iat", "purpose"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("expired") from exc
    except jwt.InvalidTokenError as exc:
        raise TokenError("invalid") from exc
    if claims.get("purpose") != purpose:
        raise TokenError("wrong purpose")
    try:
        uuid.UUID(claims["sub"])
    except (ValueError, TypeError) as exc:
        raise TokenError("invalid subject") from exc
    return claims
