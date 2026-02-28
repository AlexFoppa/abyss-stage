from __future__ import annotations

from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class Scenario(SQLModel, table=True):
    id: str = Field(primary_key=True, max_length=36)
    name: str = Field(max_length=200)
    description: str = Field(default="")
    image_storage_key: Optional[str] = Field(default=None, max_length=500)
    # Recorte da imagem no palco (0–1): x, y = canto superior esquerdo; width, height = tamanho. Se null, usa imagem inteira (cover center).
    crop_x: Optional[float] = Field(default=None)
    crop_y: Optional[float] = Field(default=None)
    crop_width: Optional[float] = Field(default=None)
    crop_height: Optional[float] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
