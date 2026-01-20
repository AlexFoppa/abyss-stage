# apps/api/backend/routers/characters.py
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session
from sqlalchemy import text

from apps.api.backend.db import get_session
from apps.api.backend.routers.auth import get_current_user
from apps.api.backend.models.user import User, Role
from apps.api.backend.routers.candela_bootstrap import bootstrap_candela

router = APIRouter(prefix="/me/characters", tags=["characters"])


class CharacterCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    concept: str = Field(default="", max_length=200)
    backstory: str = Field(default="")
    notes: str = Field(default="")

class CharacterOut(BaseModel):
    id: int
    name: str
    concept: str
    system: str                  # base: sempre "simplificado"
    backstory: str
    notes: str
    systems: list[str] = Field(default_factory=list)     # sistemas ativos (ex: ["simplificado","candela_obscura"])


class CandelaCreateIn(BaseModel):
    role_id: int
    specialty_id: int

class CandelaOut(BaseModel):
    role_id: int
    specialty_id: int

class CandelaUpdateIn(BaseModel):
    role_id: int
    specialty_id: int

class CharacterUpdateIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    concept: str = Field(default="", max_length=200)
    backstory: str = Field(default="")
    notes: str = Field(default="")

def _require_player(user: User = Depends(get_current_user)) -> User:
    if user.role != Role.PLAYER:
        raise HTTPException(status_code=403, detail="PLAYER only")
    return user


def _load_systems_map(session: Session, character_ids: list[int]) -> dict[int, list[str]]:
    if not character_ids:
        return {}

    # SQLite + text(): monta placeholders estáveis (:id0, :id1, ...)
    placeholders = ", ".join([f":id{i}" for i in range(len(character_ids))])
    params = {f"id{i}": cid for i, cid in enumerate(character_ids)}

    rows = session.exec(
        text(
            f"""
            SELECT character_id, system_key
            FROM character_system
            WHERE character_id IN ({placeholders}) AND status='ACTIVE'
            ORDER BY character_id, system_key
            """
        ),
        params=params,
    ).all()

    m: dict[int, list[str]] = {cid: [] for cid in character_ids}
    for cid, sk in rows:
        m.setdefault(cid, []).append(sk)
    return m

def _candela_exists(session: Session, character_id: int) -> bool:
    row = session.exec(
        text(
            """
            SELECT 1
            FROM character_system
            WHERE character_id=:cid AND system_key='candela_obscura' AND status='ACTIVE'
            """
        ),
        params={"cid": character_id},
    ).first()
    return bool(row)


def _candela_clear(session: Session, character_id: int) -> None:
    # ordem segura por FKs (children -> parent)
    session.exec(
        text("DELETE FROM candela_character_action WHERE character_id=:cid"),
        params={"cid": character_id},
    )
    session.exec(
        text("DELETE FROM candela_character_group_state WHERE character_id=:cid"),
        params={"cid": character_id},
    )
    session.exec(
        text("DELETE FROM candela_character_mark WHERE character_id=:cid"),
        params={"cid": character_id},
    )
    session.exec(
        text("DELETE FROM candela_character_choice WHERE character_id=:cid"),
        params={"cid": character_id},
    )
    session.exec(
        text("DELETE FROM candela_character_sheet WHERE character_id=:cid"),
        params={"cid": character_id},
    )


@router.get("")
def list_my_characters(
    user: User = Depends(_require_player),
    session: Session = Depends(get_session),
):
    rows = session.exec(
        text(
            """
            SELECT id, name, concept, system, backstory, notes
            FROM character
            WHERE kind='PC' AND owner_user_id = :uid
            ORDER BY id DESC
            """
        ),
        params={"uid": user.id},
    ).all()

    ids = [r[0] for r in rows]
    sys_map = _load_systems_map(session, ids)

    out: list[CharacterOut] = []
    for r in rows:
        cid = r[0]
        base_system = (r[3] or "simplificado").strip() or "simplificado"
        out.append(
            CharacterOut(
                id=cid,
                name=r[1],
                concept=r[2],
                system=base_system,
                backstory=r[4],
                notes=r[5],
                systems=(sys_map.get(cid) or [base_system]),
            )
        )
    return out

@router.post("", status_code=201)
def create_my_character(
    data: CharacterCreateIn,
    user: User = Depends(_require_player),
    session: Session = Depends(get_session),
):
    base_system = "simplificado"

    try:
        session.exec(text("BEGIN"))

        session.exec(
            text(
                """
                INSERT INTO character (kind, owner_user_id, name, concept, system, backstory, notes)
                VALUES ('PC', :uid, :name, :concept, :system, :backstory, :notes)
                """
            ),
            params={
                "uid": user.id,
                "name": data.name,
                "concept": data.concept,
                "system": base_system,
                "backstory": data.backstory,
                "notes": data.notes,
            },
        )
        character_id = session.exec(text("SELECT last_insert_rowid()")).one()[0]

        # garante vínculo "simplificado" em character_system
        session.exec(
            text(
                """
                INSERT OR IGNORE INTO character_system (character_id, system_key, status)
                VALUES (:cid, 'simplificado', 'ACTIVE')
                """
            ),
            params={"cid": character_id},
        )

        session.exec(text("COMMIT"))
    except HTTPException:
        session.exec(text("ROLLBACK"))
        raise
    except Exception as e:
        session.exec(text("ROLLBACK"))
        raise HTTPException(status_code=500, detail=f"Create failed: {e}")

    row = session.exec(
        text(
            """
            SELECT id, name, concept, system, backstory, notes
            FROM character WHERE id = :cid
            """
        ),
        params={"cid": character_id},
    ).one()

    sys_map = _load_systems_map(session, [character_id])
    return {
        "character": CharacterOut(
            id=row[0],
            name=row[1],
            concept=row[2],
            system=row[3],
            backstory=row[4],
            notes=row[5],
            systems=sys_map.get(character_id, ["simplificado"]),
        )
    }

@router.get("/{character_id}")
def get_my_character(
    character_id: int,
    user: User = Depends(_require_player),
    session: Session = Depends(get_session),
):
    row = session.exec(
        text(
            """
            SELECT id, name, concept, system, backstory, notes
            FROM character
            WHERE id = :cid AND kind='PC' AND owner_user_id = :uid
            """
        ),
        params={"cid": character_id, "uid": user.id},
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Character not found")

    sys_map = _load_systems_map(session, [character_id])
    return CharacterOut(
        id=row[0],
        name=row[1],
        concept=row[2],
        system=row[3],
        backstory=row[4],
        notes=row[5],
        systems=sys_map.get(character_id, ["simplificado"]),
    )

@router.put("/{character_id}")
def update_my_character(
    character_id: int,
    data: CharacterUpdateIn,
    user: User = Depends(_require_player),
    session: Session = Depends(get_session),
):
    row = session.exec(
        text(
            """
            SELECT id, system
            FROM character
            WHERE id = :cid AND kind='PC' AND owner_user_id = :uid
            """
        ),
        params={"cid": character_id, "uid": user.id},
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Character not found")

    try:
        session.exec(text("BEGIN"))

        session.exec(
            text(
                """
                UPDATE character
                SET name=:name,
                    concept=:concept,
                    backstory=:backstory,
                    notes=:notes,
                    updated_at=datetime('now')
                WHERE id=:cid
                """
            ),
            params={
                "cid": character_id,
                "name": data.name,
                "concept": data.concept,
                "backstory": data.backstory,
                "notes": data.notes,
            },
        )

        session.exec(text("COMMIT"))
    except Exception as e:
        session.exec(text("ROLLBACK"))
        raise HTTPException(status_code=500, detail=f"Update failed: {e}")

    row2 = session.exec(
        text(
            """
            SELECT id, name, concept, system, backstory, notes
            FROM character
            WHERE id = :cid
            """
        ),
        params={"cid": character_id},
    ).one()

    sys_map = _load_systems_map(session, [character_id])
    return CharacterOut(
        id=row2[0],
        name=row2[1],
        concept=row2[2],
        system=row2[3],
        backstory=row2[4],
        notes=row2[5],
        systems=sys_map.get(character_id, ["simplificado"]),
    )

@router.post("/{character_id}/systems/{system_key}", status_code=201)
def create_character_system(
    character_id: int,
    system_key: str,
    data: CandelaCreateIn,
    user: User = Depends(_require_player),
    session: Session = Depends(get_session),
):
    system_key = (system_key or "").strip()

    # valida dono
    row = session.exec(
        text(
            """
            SELECT 1
            FROM character
            WHERE id = :cid AND kind='PC' AND owner_user_id = :uid
            """
        ),
        params={"cid": character_id, "uid": user.id},
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Character not found")

    if system_key == "simplificado":
        raise HTTPException(status_code=400, detail="Base system already exists")

    if system_key != "candela_obscura":
        raise HTTPException(status_code=400, detail="Unsupported system for now")

    try:
        session.exec(text("BEGIN"))

        exists = session.exec(
            text(
                """
                SELECT 1 FROM character_system
                WHERE character_id=:cid AND system_key=:sk AND status='ACTIVE'
                """
            ),
            params={"cid": character_id, "sk": system_key},
        ).first()
        if exists:
            raise HTTPException(status_code=409, detail="System already exists for this character")

        session.exec(
            text(
                """
                INSERT INTO character_system (character_id, system_key, status)
                VALUES (:cid, :sk, 'ACTIVE')
                """
            ),
            params={"cid": character_id, "sk": system_key},
        )

        bootstrap_candela(session, character_id, int(data.role_id), int(data.specialty_id))

        session.exec(text("COMMIT"))
    except HTTPException:
        session.exec(text("ROLLBACK"))
        raise
    except Exception as e:
        session.exec(text("ROLLBACK"))
        raise HTTPException(status_code=500, detail=f"Create system failed: {e}")

    return {"ok": True}
@router.get("/{character_id}/systems/candela_obscura")
def get_candela_system(
    character_id: int,
    user: User = Depends(_require_player),
    session: Session = Depends(get_session),
):
    # valida dono
    row = session.exec(
        text(
            """
            SELECT 1
            FROM character
            WHERE id = :cid AND kind='PC' AND owner_user_id = :uid
            """
        ),
        params={"cid": character_id, "uid": user.id},
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Character not found")

    if not _candela_exists(session, character_id):
        raise HTTPException(status_code=404, detail="Candela system not found")

    choice = session.exec(
        text(
            """
            SELECT role_id, specialty_id
            FROM candela_character_choice
            WHERE character_id=:cid
            """
        ),
        params={"cid": character_id},
    ).first()

    if not choice:
        raise HTTPException(status_code=500, detail="Candela data missing (choice)")

    return CandelaOut(role_id=int(choice[0]), specialty_id=int(choice[1]))

@router.put("/{character_id}/systems/candela_obscura")
def update_candela_system(
    character_id: int,
    data: CandelaUpdateIn,
    user: User = Depends(_require_player),
    session: Session = Depends(get_session),
):
    # valida dono
    row = session.exec(
        text(
            """
            SELECT 1
            FROM character
            WHERE id = :cid AND kind='PC' AND owner_user_id = :uid
            """
        ),
        params={"cid": character_id, "uid": user.id},
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Character not found")

    if not _candela_exists(session, character_id):
        raise HTTPException(status_code=404, detail="Candela system not found")

    try:
        session.exec(text("BEGIN"))

        _candela_clear(session, character_id)
        bootstrap_candela(session, character_id, int(data.role_id), int(data.specialty_id))

        session.exec(text("COMMIT"))
    except HTTPException:
        session.exec(text("ROLLBACK"))
        raise
    except Exception as e:
        session.exec(text("ROLLBACK"))
        raise HTTPException(status_code=500, detail=f"Update system failed: {e}")

    return {"ok": True}
