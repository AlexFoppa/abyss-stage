from __future__ import annotations

from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class Scene(SQLModel, table=True):
    id: str = Field(primary_key=True, max_length=36)
    story_id: str = Field(foreign_key="story.id", max_length=36, index=True)
    title: str = Field(max_length=200)
    body: str = Field(default="")
    order_index: int = Field(default=0)
    is_narrative: bool = Field(default=False)
    narrative_black_start: bool = Field(default=False)
    scenario_id: Optional[str] = Field(default=None, max_length=36)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
