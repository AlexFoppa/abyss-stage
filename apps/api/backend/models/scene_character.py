"""Vínculo cena–personagem (Figurino) com ordem para o editor GM."""
from __future__ import annotations

from sqlmodel import SQLModel, Field, UniqueConstraint


class SceneCharacter(SQLModel, table=True):
    __tablename__ = "scene_character"
    __table_args__ = (UniqueConstraint("scene_id", "character_id"),)

    scene_id: str = Field(foreign_key="scene.id", max_length=36, primary_key=True)
    character_id: int = Field(primary_key=True)
    order_index: int = Field(default=0)
