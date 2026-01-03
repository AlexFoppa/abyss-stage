from __future__ import annotations

from enum import Enum
from typing import Optional
from sqlmodel import SQLModel, Field


class Role(str, Enum):
    GM = "GM"
    PLAYER = "PLAYER"


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    name: str
    email: str = Field(index=True, unique=True)

    password_hash: str

    role: Role = Field(default=Role.PLAYER, index=True)
    must_reset_password: bool = Field(default=False)
