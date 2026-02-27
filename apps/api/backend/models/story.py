from __future__ import annotations

from datetime import datetime
from sqlalchemy import Column, Text
from sqlmodel import SQLModel, Field


class Story(SQLModel, table=True):
    id: str = Field(primary_key=True, max_length=36)
    name: str = Field(max_length=200)
    premissa: str = Field(default="", sa_column=Column(Text(), default="", nullable=False))
    o_que_aconteceu: str = Field(default="", sa_column=Column(Text(), default="", nullable=False))
    temas: str = Field(default="", max_length=500)
    atmosfera: str = Field(default="", max_length=500)
    notas: str = Field(default="", sa_column=Column(Text(), default="", nullable=False))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
