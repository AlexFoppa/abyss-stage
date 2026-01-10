# apps/api/backend/routers/characters.py
from __future__ import annotations
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session
from apps.api.backend.db import get_session
from apps.api.backend.routers.auth import get_current_user
from apps.api.backend.models.user import User, Role

router = APIRouter(prefix="/me/characters", tags=["characters"])

class CharacterCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    concept: str = Field(default="", max_length=200)
    system: str = Field(min_length=1, max_length=80)
    backstory: str = Field(default="")
    notes: str = Field(default="")
    role_id: Optional[int] = None
    specialty_id: Optional[int] = None

class CharacterOut(BaseModel):
    id: int
    name: str
    concept: str
    system: str
    backstory: str
    notes: str

def _require_player(user: User = Depends(get_current_user)) -> User:
    if user.role != Role.PLAYER:
        raise HTTPException(status_code=403, detail="PLAYER only")
    return user

@router.get("")
def list_my_characters(
    user: User = Depends(_require_player),
    session: Session = Depends(get_session),
):
    rows = session.exec(
        """
        SELECT id, name, concept, system, backstory, notes
        FROM character
        WHERE kind='PC' AND owner_user_id = :uid
        ORDER BY id DESC
        """,
        {"uid": user.id},
    ).all()
    return [CharacterOut(id=r[0], name=r[1], concept=r[2], system=r[3], backstory=r[4], notes=r[5]) for r in rows]

@router.post("", status_code=201)
def create_my_character(
    data: CharacterCreateIn,
    user: User = Depends(_require_player),
    session: Session = Depends(get_session),
):
    # must_reset_password já é bloqueado em get_current_user para qualquer rota fora do allowlist do auth
    if data.system != "candela_obscura":
        raise HTTPException(status_code=400, detail="Unsupported system for now")

    if not data.role_id or not data.specialty_id:
        raise HTTPException(status_code=400, detail="role_id and specialty_id are required for candela_obscura")

    try:
        # transação manual simples
        session.exec("BEGIN")

        # 1) character (PC)
        session.exec(
            """
            INSERT INTO character (kind, owner_user_id, name, concept, system, backstory, notes)
            VALUES ('PC', :uid, :name, :concept, :system, :backstory, :notes)
            """,
            {
                "uid": user.id,
                "name": data.name,
                "concept": data.concept,
                "system": data.system,
                "backstory": data.backstory,
                "notes": data.notes,
            },
        )
        character_id = session.exec("SELECT last_insert_rowid()").one()[0]

        # 2) sheet 1:1
        session.exec("INSERT INTO candela_character_sheet (character_id) VALUES (:cid)", {"cid": character_id})

        # 3) choice (role + specialty)
        session.exec(
            """
            INSERT INTO candela_character_choice (character_id, role_id, specialty_id)
            VALUES (:cid, :role_id, :specialty_id)
            """,
            {"cid": character_id, "role_id": data.role_id, "specialty_id": data.specialty_id},
        )

        # 4) marks (3 linhas)
        for mk in ("CORPO", "MENTE", "SANGRIA"):
            session.exec(
                "INSERT INTO candela_character_mark (character_id, mark_key, current, max) VALUES (:cid, :mk, 0, 3)",
                {"cid": character_id, "mk": mk},
            )

        # 5) group_state a partir de candela_specialty_group_default (se existir); fallback: 3 grupos zerados
        try:
            session.exec(
                """
                INSERT INTO candela_character_group_state (character_id, group_key, drive_current, drive_max, resist_current, resist_max)
                SELECT :cid, d.group_key, 0, d.drive_max, 0, d.resist_max
                FROM candela_specialty_group_default d
                WHERE d.specialty_id = :sid
                """,
                {"cid": character_id, "sid": data.specialty_id},
            )
            inserted = session.exec(
                "SELECT COUNT(*) FROM candela_character_group_state WHERE character_id=:cid",
                {"cid": character_id},
            ).one()[0]
            if inserted == 0:
                raise RuntimeError("no defaults")
        except Exception:
            for gk in ("VIGOR", "ASTUCIA", "INTUICAO"):
                session.exec(
                    """
                    INSERT INTO candela_character_group_state (character_id, group_key, drive_current, drive_max, resist_current, resist_max)
                    VALUES (:cid, :gk, 0, 0, 0, 0)
                    """,
                    {"cid": character_id, "gk": gk},
                )

        # 6) actions a partir de candela_specialty_action_default + 1 gilded
        # tenta usar gilded_default se existir; fallback: gilded na primeira ação
        gilded_set = 0
        try:
            rows = session.exec(
                """
                SELECT action_key, rating, COALESCE(gilded_default, 0) AS gilded_default
                FROM candela_specialty_action_default
                WHERE specialty_id = :sid
                """,
                {"sid": data.specialty_id},
            ).all()
        except Exception:
            rows = session.exec(
                """
                SELECT action_key, rating
                FROM candela_specialty_action_default
                WHERE specialty_id = :sid
                """,
                {"sid": data.specialty_id},
            ).all()
            rows = [(r[0], r[1], 0) for r in rows]

        if not rows:
            raise HTTPException(status_code=400, detail="Specialty has no action defaults")

        def group_for(action_key: str) -> str:
            if action_key in ("MOVER", "ATACAR", "CONTROLAR"): return "VIGOR"
            if action_key in ("INFLUENCIAR", "LER", "ESCONDER"): return "ASTUCIA"
            return "INTUICAO"

        for i, (action_key, rating, gilded_default) in enumerate(rows):
            gilded = 1 if (gilded_default == 1 and gilded_set == 0) else 0
            if gilded == 1:
                gilded_set = 1
            session.exec(
                """
                INSERT INTO candela_character_action (character_id, action_key, group_key, rating, gilded)
                VALUES (:cid, :ak, :gk, :rt, :gd)
                """,
                {"cid": character_id, "ak": action_key, "gk": group_for(action_key), "rt": rating, "gd": gilded},
            )

        if gilded_set == 0:
            # força 1 dourada na primeira action inserida
            first_action = rows[0][0]
            session.exec(
                """
                UPDATE candela_character_action
                SET gilded = 1
                WHERE character_id = :cid AND action_key = :ak
                """,
                {"cid": character_id, "ak": first_action},
            )

        session.exec("COMMIT")
    except HTTPException:
        session.exec("ROLLBACK")
        raise
    except Exception as e:
        session.exec("ROLLBACK")
        raise HTTPException(status_code=500, detail=f"Bootstrap failed: {e}")

    row = session.exec(
        """
        SELECT id, name, concept, system, backstory, notes
        FROM character WHERE id = :cid
        """,
        {"cid": character_id},
    ).one()

    return {"character": CharacterOut(id=row[0], name=row[1], concept=row[2], system=row[3], backstory=row[4], notes=row[5])}
