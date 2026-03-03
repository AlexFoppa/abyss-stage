"""Personagem (PC ou NPC): entidade de jogo com nome, conceito, sistema, etc."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field


class Character(SQLModel, table=True):
    """Mapeia a tabela `character`. PC exige owner_user_id; NPC exige created_by_gm_id (checks no banco)."""
    __tablename__ = "character"

    id: Optional[int] = Field(default=None, primary_key=True)
    kind: str = Field(index=True)  # "PC" | "NPC" (check no banco)
    owner_user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    created_by_gm_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    name: str = Field(max_length=255)
    concept: str = Field(default="", max_length=500)
    system: str = Field(default="simplificado", index=True)
    backstory: str = Field(default="")
    notes: str = Field(default="")
    dataset_json: str = Field(default="{}")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
