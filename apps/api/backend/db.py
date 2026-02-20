from __future__ import annotations

from sqlalchemy import text
from sqlmodel import SQLModel, Session, create_engine
from apps.api.backend.config import settings
from apps.api.backend.models.user import User
from apps.api.backend.models.story import Story  # noqa: F401 - registra tabela para create_all
from apps.api.backend.models.scene import Scene  # noqa: F401 - registra tabela para create_all
from apps.api.backend.models.scenario import Scenario  # noqa: F401 - registra tabela para create_all
from apps.api.backend.models.scene_character import SceneCharacter  # noqa: F401 - registra tabela para create_all
from apps.api.backend.models.story_character import StoryCharacter  # noqa: F401 - registra tabela para create_all

# arquivo SQLite local (na raiz do repo). Pode mudar depois.
DATABASE_URL = "sqlite:///./abyss.db"

engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},  # necessário p/ SQLite + threads
)

def init_db() -> None:
    # Recria tabelas se existirem com schema antigo
    with engine.connect() as conn:
        r = conn.execute(text(
            "SELECT COUNT(*) FROM pragma_table_info('story') WHERE name = 'name'"
        )).scalar()
        if r is not None and r == 0:
            conn.execute(text("DROP TABLE IF EXISTS story"))
            conn.commit()
        r = conn.execute(text(
            "SELECT COUNT(*) FROM pragma_table_info('scene') WHERE name = 'order_index'"
        )).scalar()
        if r is not None and r == 0:
            conn.execute(text("DROP TABLE IF EXISTS scene"))
            conn.commit()
        r = conn.execute(text(
            "SELECT COUNT(*) FROM pragma_table_info('scenario') WHERE name = 'name'"
        )).scalar()
        if r is not None and r == 0:
            conn.execute(text("DROP TABLE IF EXISTS scenario"))
            conn.commit()
    SQLModel.metadata.create_all(engine)
    # scene_character: criada por create_all; sem checagem de schema antigo

def get_session():
    with Session(engine) as session:
        yield session
