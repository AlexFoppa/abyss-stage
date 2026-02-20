"""Vínculo história–personagem (elenco da história)."""
from __future__ import annotations

from sqlmodel import SQLModel, Field, UniqueConstraint


class StoryCharacter(SQLModel, table=True):
    __tablename__ = "story_character"
    __table_args__ = (UniqueConstraint("story_id", "character_id"),)

    story_id: str = Field(foreign_key="story.id", max_length=36, primary_key=True)
    character_id: int = Field(primary_key=True)
