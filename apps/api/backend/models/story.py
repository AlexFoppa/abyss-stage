from __future__ import annotations

from datetime import datetime
from sqlmodel import SQLModel, Field


class Story(SQLModel, table=True):
    id: str = Field(primary_key=True, max_length=36)
    name: str = Field(max_length=200)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
