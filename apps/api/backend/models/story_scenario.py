"""Vínculo história–cenário (pool do editor: cenários disponíveis além dos já em cenas)."""
from __future__ import annotations

from sqlmodel import SQLModel, Field, UniqueConstraint


class StoryScenario(SQLModel, table=True):
    __tablename__ = "story_scenario"
    __table_args__ = (UniqueConstraint("story_id", "scenario_id"),)

    story_id: str = Field(foreign_key="story.id", max_length=36, primary_key=True)
    scenario_id: str = Field(foreign_key="scenario.id", max_length=36, primary_key=True)
