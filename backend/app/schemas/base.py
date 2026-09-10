"""
Pydantic base classes.

The mobile client expects camelCase JSON (`accessToken`, `pageSize`, ...),
while Python code uses snake_case. `CamelModel` handles the translation in
both directions so neither side has to compromise.
"""

from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

T = TypeVar("T")


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class Paginated(CamelModel, Generic[T]):
    """Matches `Paginated<T>` in the app's `src/services/api/types.ts`."""

    items: list[T]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1)
    total: int = Field(ge=0)
    has_more: bool

    @classmethod
    def build(cls, items: list[T], *, page: int, page_size: int, total: int) -> "Paginated[T]":
        return cls(
            items=items,
            page=page,
            page_size=page_size,
            total=total,
            has_more=page * page_size < total,
        )


class PageParams(CamelModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size
