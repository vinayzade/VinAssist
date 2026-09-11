from __future__ import annotations

from sqlalchemy import func, select

from app.models.user import User
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    model = User

    async def get_by_email(self, email: str) -> User | None:
        """Case-insensitive lookup, matching the unique index on lower(email)."""
        stmt = select(User).where(func.lower(User.email) == email.strip().lower())
        return await self.session.scalar(stmt)

    async def email_exists(self, email: str) -> bool:
        stmt = select(User.id).where(func.lower(User.email) == email.strip().lower())
        return (await self.session.scalar(stmt)) is not None
