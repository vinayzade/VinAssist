"""End-to-end auth flows through the HTTP layer against the migrated database."""

from __future__ import annotations

import uuid
from datetime import timedelta

import jwt
import pytest
from httpx import AsyncClient

from app.core.config import get_settings
from app.core.security import create_access_token

pytestmark = pytest.mark.asyncio

PASSWORD = "Str0ngPassw0rd"


def _payload(**overrides: str) -> dict[str, str]:
    base = {
        "name": "Vin Test",
        "email": f"{uuid.uuid4().hex[:10]}@example.com",
        "password": PASSWORD,
    }
    base.update(overrides)
    return base


async def _register(client: AsyncClient, **overrides: str) -> dict:  # type: ignore[type-arg]
    response = await client.post("/api/v1/auth/register", json=_payload(**overrides))
    assert response.status_code == 201, response.text
    return response.json()


# --- register -----------------------------------------------------------------


async def test_register_returns_user_and_tokens_in_app_shape(client: AsyncClient) -> None:
    payload = _payload(email="New.User@Example.com")

    response = await client.post("/api/v1/auth/register", json=payload)

    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"user", "accessToken", "refreshToken", "tokenType"}
    assert body["tokenType"] == "bearer"
    assert body["user"]["name"] == "Vin Test"
    assert body["user"]["email"] == "new.user@example.com"  # normalised
    assert set(body["user"]) == {"id", "name", "email", "avatarUrl", "createdAt"}
    uuid.UUID(body["user"]["id"])
    assert "password" not in response.text.lower()

    # The access token is a JWT for this user; the refresh token is opaque.
    claims = jwt.decode(body["accessToken"], options={"verify_signature": False})
    assert claims["sub"] == body["user"]["id"]
    assert claims["purpose"] == "access"
    assert len(body["refreshToken"]) >= 40


async def test_register_rejects_duplicate_email_case_insensitively(client: AsyncClient) -> None:
    await _register(client, email="dup@example.com")

    response = await client.post("/api/v1/auth/register", json=_payload(email="DUP@example.com"))

    assert response.status_code == 409
    assert response.json() == {
        "detail": "An account with that email already exists.",
        "code": "EMAIL_TAKEN",
    }


@pytest.mark.parametrize(
    ("field", "value", "fragment"),
    [
        ("password", "short1", "at least 8"),
        ("password", "lettersonly", "letters and numbers"),
        ("password", "12345678", "letters and numbers"),
        ("email", "not-an-email", "email"),
        ("name", " ", "at least 2"),
    ],
)
async def test_register_validation_errors_name_the_field(
    client: AsyncClient, field: str, value: str, fragment: str
) -> None:
    response = await client.post("/api/v1/auth/register", json=_payload(**{field: value}))

    assert response.status_code == 422
    errors = response.json()["detail"]
    assert errors[0]["loc"][-1] == field
    assert fragment.lower() in errors[0]["msg"].lower()


# --- login --------------------------------------------------------------------


async def test_login_succeeds_with_correct_password(client: AsyncClient) -> None:
    registered = await _register(client, email="login@example.com")

    response = await client.post(
        "/api/v1/auth/login", json={"email": "LOGIN@example.com", "password": PASSWORD}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["id"] == registered["user"]["id"]
    assert body["accessToken"] and body["refreshToken"]
    assert body["refreshToken"] != registered["refreshToken"]


async def test_login_rejects_wrong_password_and_unknown_email_identically(
    client: AsyncClient,
) -> None:
    await _register(client, email="known@example.com")

    wrong = await client.post(
        "/api/v1/auth/login", json={"email": "known@example.com", "password": "Wrong1234"}
    )
    unknown = await client.post(
        "/api/v1/auth/login", json={"email": "nobody@example.com", "password": PASSWORD}
    )

    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()
    assert wrong.json()["code"] == "INVALID_CREDENTIALS"


# --- bearer auth ----------------------------------------------------------------


async def test_me_requires_a_valid_bearer_token(client: AsyncClient) -> None:
    registered = await _register(client)
    headers = {"Authorization": f"Bearer {registered['accessToken']}"}

    ok = await client.get("/api/v1/users/me", headers=headers)
    missing = await client.get("/api/v1/users/me")
    garbage = await client.get("/api/v1/users/me", headers={"Authorization": "Bearer nope"})

    assert ok.status_code == 200
    assert ok.json()["email"] == registered["user"]["email"]
    assert missing.status_code == 401
    assert missing.json()["code"] == "NOT_AUTHENTICATED"
    assert garbage.status_code == 401
    assert garbage.json()["code"] == "TOKEN_INVALID"


async def test_expired_access_token_is_rejected(client: AsyncClient) -> None:
    registered = await _register(client)
    settings = get_settings()
    expired = create_access_token(
        uuid.UUID(registered["user"]["id"]),
        secret=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
        ttl=timedelta(seconds=-1),
    )

    response = await client.get(
        "/api/v1/users/me", headers={"Authorization": f"Bearer {expired}"}
    )

    assert response.status_code == 401
    assert response.json()["code"] == "TOKEN_INVALID"


# --- refresh ------------------------------------------------------------------


async def test_refresh_rotates_tokens(client: AsyncClient) -> None:
    registered = await _register(client)

    response = await client.post(
        "/api/v1/auth/refresh", json={"refreshToken": registered["refreshToken"]}
    )

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"accessToken", "refreshToken", "tokenType"}
    assert body["refreshToken"] != registered["refreshToken"]

    # New pair works; the old refresh token is now dead.
    me = await client.get(
        "/api/v1/users/me", headers={"Authorization": f"Bearer {body['accessToken']}"}
    )
    assert me.status_code == 200
    old = await client.post(
        "/api/v1/auth/refresh", json={"refreshToken": registered["refreshToken"]}
    )
    assert old.status_code == 401


async def test_refresh_token_reuse_revokes_every_session(client: AsyncClient) -> None:
    registered = await _register(client)
    first = registered["refreshToken"]

    rotated = (await client.post("/api/v1/auth/refresh", json={"refreshToken": first})).json()
    # Replay of the already-rotated token: treated as theft.
    replay = await client.post("/api/v1/auth/refresh", json={"refreshToken": first})
    assert replay.status_code == 401

    # ...and the legitimately rotated token is dead too.
    after = await client.post(
        "/api/v1/auth/refresh", json={"refreshToken": rotated["refreshToken"]}
    )
    assert after.status_code == 401
    assert after.json()["code"] == "INVALID_REFRESH_TOKEN"


async def test_refresh_rejects_unknown_token(client: AsyncClient) -> None:
    response = await client.post("/api/v1/auth/refresh", json={"refreshToken": "made-up"})
    assert response.status_code == 401


# --- logout -------------------------------------------------------------------


async def test_logout_revokes_the_refresh_token(client: AsyncClient) -> None:
    registered = await _register(client)

    response = await client.post(
        "/api/v1/auth/logout",
        json={"refreshToken": registered["refreshToken"]},
        headers={"Authorization": f"Bearer {registered['accessToken']}"},
    )

    assert response.status_code == 204
    again = await client.post(
        "/api/v1/auth/refresh", json={"refreshToken": registered["refreshToken"]}
    )
    assert again.status_code == 401


async def test_logout_without_a_body_or_token_still_succeeds(client: AsyncClient) -> None:
    response = await client.post("/api/v1/auth/logout")
    assert response.status_code == 204


# --- password reset -----------------------------------------------------------


async def test_forgot_password_is_silent_and_reset_works(
    client: AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    registered = await _register(client, email="reset@example.com")

    with caplog.at_level("WARNING"):
        known = await client.post("/api/v1/auth/forgot-password", json={"email": "reset@example.com"})
        unknown = await client.post(
            "/api/v1/auth/forgot-password", json={"email": "ghost@example.com"}
        )
    assert known.status_code == unknown.status_code == 204

    # No email provider yet: the token is logged in non-production.
    logged = [r.message for r in caplog.records if "token=" in r.message]
    assert len(logged) == 1
    token = logged[0].split("token=")[1].strip()

    reset = await client.post(
        "/api/v1/auth/reset-password", json={"token": token, "password": "N3wPassword"}
    )
    assert reset.status_code == 204

    # Old password fails, new one works, old sessions are gone, token is single-use.
    old_login = await client.post(
        "/api/v1/auth/login", json={"email": "reset@example.com", "password": PASSWORD}
    )
    new_login = await client.post(
        "/api/v1/auth/login", json={"email": "reset@example.com", "password": "N3wPassword"}
    )
    old_refresh = await client.post(
        "/api/v1/auth/refresh", json={"refreshToken": registered["refreshToken"]}
    )
    reuse = await client.post(
        "/api/v1/auth/reset-password", json={"token": token, "password": "An0therOne"}
    )
    assert old_login.status_code == 401
    assert new_login.status_code == 200
    assert old_refresh.status_code == 401
    assert reuse.status_code == 400
    assert reuse.json()["code"] == "INVALID_RESET_TOKEN"


# --- users/me ----------------------------------------------------------------------


async def test_update_profile_and_change_password(client: AsyncClient) -> None:
    registered = await _register(client)
    headers = {"Authorization": f"Bearer {registered['accessToken']}"}

    updated = await client.patch("/api/v1/users/me", json={"name": "Renamed"}, headers=headers)
    assert updated.status_code == 200
    assert updated.json()["name"] == "Renamed"

    changed = await client.post(
        "/api/v1/users/me/password",
        json={"currentPassword": PASSWORD, "newPassword": "Chang3dPass"},
        headers=headers,
    )
    assert changed.status_code == 204

    wrong = await client.post(
        "/api/v1/users/me/password",
        json={"currentPassword": "nope1234", "newPassword": "Chang3dPass"},
        headers=headers,
    )
    assert wrong.status_code == 401


async def test_delete_account_cascades_sessions(client: AsyncClient) -> None:
    registered = await _register(client)
    headers = {"Authorization": f"Bearer {registered['accessToken']}"}

    deleted = await client.delete("/api/v1/users/me", headers=headers)
    assert deleted.status_code == 204

    # The old access token now fails authentication (401, not a 404 lookup),
    # so the app signs the user out instead of showing a generic error.
    gone = await client.get("/api/v1/users/me", headers=headers)
    assert gone.status_code == 401
    assert gone.json()["code"] == "USER_NOT_FOUND"
    refresh = await client.post(
        "/api/v1/auth/refresh", json={"refreshToken": registered["refreshToken"]}
    )
    assert refresh.status_code == 401
