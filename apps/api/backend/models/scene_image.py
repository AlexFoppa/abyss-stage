"""Imagens ordenadas de cena narrativa (galeria no editor, slides no espetáculo)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field


class SceneImage(SQLModel, table=True):
    __tablename__ = "scene_image"

    scene_id: str = Field(foreign_key="scene.id", max_length=36, primary_key=True)
    order_index: int = Field(primary_key=True)
    storage_key: str = Field(max_length=512)
    mime: Optional[str] = Field(default=None, max_length=128)
    crop_x: Optional[float] = Field(default=None)
    crop_y: Optional[float] = Field(default=None)
    crop_width: Optional[float] = Field(default=None)
    crop_height: Optional[float] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
