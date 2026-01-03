from __future__ import annotations

from sqlmodel import SQLModel, Session, create_engine
from apps.api.backend.config import settings
from apps.api.backend.models.user import User 

# arquivo SQLite local (na raiz do repo). Pode mudar depois.
DATABASE_URL = "sqlite:///./abyss.db"

engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},  # necessário p/ SQLite + threads
)

def init_db() -> None:
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session
