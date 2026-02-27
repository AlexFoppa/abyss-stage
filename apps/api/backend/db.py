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
        # Story: adicionar colunas de premissa, o_que_aconteceu, temas, atmosfera, notas se não existirem
        for col, col_type in [
            ("premissa", "TEXT DEFAULT ''"),
            ("o_que_aconteceu", "TEXT DEFAULT ''"),
            ("temas", "VARCHAR(500) DEFAULT ''"),
            ("atmosfera", "VARCHAR(500) DEFAULT ''"),
            ("notas", "TEXT DEFAULT ''"),
        ]:
            r = conn.execute(text(
                f"SELECT COUNT(*) FROM pragma_table_info('story') WHERE name = '{col}'"
            )).scalar()
            if r is not None and r == 0:
                conn.execute(text(f"ALTER TABLE story ADD COLUMN {col} {col_type}"))
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
        # scene_character: migration had scene_id INTEGER and no order_index; model needs scene_id TEXT (UUID) and order_index
        try:
            info = conn.execute(text("SELECT name, type FROM pragma_table_info('scene_character')")).fetchall()
            cols = {(row[0] or "").lower(): (row[1] or "").upper() for row in info} if info else {}
            if cols.get("scene_id") == "INTEGER" or "order_index" not in cols:
                conn.execute(text("DROP TABLE IF EXISTS scene_character"))
                conn.commit()
        except Exception:
            pass
    SQLModel.metadata.create_all(engine)
    # scene_character: criada por create_all; sem checagem de schema antigo

def get_session():
    with Session(engine) as session:
        yield session
