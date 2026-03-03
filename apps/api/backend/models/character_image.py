"""Imagem do personagem (avatar): metadados no DB; arquivo em storage (slot 0 = default)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field


class CharacterImage(SQLModel, table=True):
    __tablename__ = "character_image"

    character_id: int = Field(foreign_key="character.id", primary_key=True)
    slot: int = Field(primary_key=True)  # 0..9; 0 = avatar default
    storage_key: str = Field(max_length=500)
    mime: Optional[str] = Field(default=None, max_length=100)
    size_bytes: Optional[int] = Field(default=None)
    sha256: Optional[str] = Field(default=None, max_length=64)
    created_at: datetime = Field(default_factory=datetime.utcnow)
