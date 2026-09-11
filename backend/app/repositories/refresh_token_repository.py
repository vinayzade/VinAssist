from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select, update

from app.models.user import RefreshToken
from app.repositories.base import BaseRepository
from app.utils.time import utcnow


class RefreshTokenRepository(BaseRepository[RefreshToken]):
    model = RefreshToken

    async def get_by_hash(self, token_hash: str) -> RefreshToken | None:
        stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        return await self.session.scalar(stmt)

    async def create(
        self,
        *,
        user_id: uuid.UUID,
        token_hash: str,
        expires_at: datetime,
        user_agent: str | None,
        ip_address: str | None,
    ) -> RefreshToken:
        token = RefreshToken(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        return await self.add(token)

    async def revoke(self, token: RefreshToken, *, replaced_by: RefreshToken | None = None) -> None:
        token.revoked_at = utcnow()
        if replaced_by is not None:
            token.replaced_by_id = replaced_by.id
        await self.session.flush()

    async def revoke_all_for_user(self, user_id: uuid.UUID) -> int:
        """Ends every session of a user (token reuse detected, password reset)."""
        stmt = (
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=utcnow())
        )
        result = await self.session.execute(stmt)
        return int(result.rowcount or 0)
