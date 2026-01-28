# apps/api/backend/routers/characters.py
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session
from sqlalchemy import text

from apps.api.backend.db import get_session
from apps.api.backend.routers.auth import get_current_user, require_gm
from apps.api.backend.models.user import User, Role
from apps.api.backend.routers.candela_bootstrap import bootstrap_candela

router = APIRouter(prefix="/me/characters", tags=["characters"])
gm_router = APIRouter(prefix="/gm/characters", tags=["gm"])

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

class GMCharacterOut(CharacterOut):
    owner_email: str

class CandelaActionIn(BaseModel):
    action_key: str
    rating: int
    gilded: bool = False

class CandelaGroupStateIn(BaseModel):
    group_key: str
    drive_current: int
    drive_max: int
    resist_current: int
    resist_max: int

class CandelaMarkIn(BaseModel):
    mark_key: str
    current: int
    max: int

class CandelaScarIn(BaseModel):
    id: Optional[int] = None
    mark_key: str
    description: str

class CandelaListItemIn(BaseModel):
    id: Optional[int] = None
    text: str

class CandelaUpsertIn(BaseModel):
    # obrigatório p/ identificar “build”
    role_id: int
    specialty_id: int

    # candela_character_sheet (sem backstory/notes aqui)
    pronouns: str = ""
    circle: str = ""
    style: str = ""
    catalyst: str = ""
    question: str = ""

    # blocos numéricos
    actions: list[CandelaActionIn] = Field(default_factory=list)
    group_state: list[CandelaGroupStateIn] = Field(default_factory=list)
    marks: list[CandelaMarkIn] = Field(default_factory=list)
    scars: list[CandelaScarIn] = Field(default_factory=list)

    relations: list[CandelaListItemIn] = Field(default_factory=list)
    equipment: list[CandelaListItemIn] = Field(default_factory=list)
    illumination_keys: list[CandelaListItemIn] = Field(default_factory=list)

    # obrigatório
    role_power_ids: list[int] = Field(default_factory=list)          # N
    specialty_power_id: Optional[int] = None                         # 1

    # obrigatório (1 do role + 1 da specialty), mas permite extras
    ability_ids: list[int] = Field(default_factory=list)


class CandelaOut(CandelaUpsertIn):
    pass


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

@gm_router.get("")
def list_all_characters(
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    rows = session.exec(
        text(
            """
            SELECT c.id, c.name, c.concept, c.system, c.backstory, c.notes, u.email
            FROM character c
            JOIN "user" u ON u.id = c.owner_user_id
            WHERE c.kind='PC'
            ORDER BY c.id DESC
            """
        )
    ).all()

    ids = [r[0] for r in rows]
    sys_map = _load_systems_map(session, ids)

    out: list[GMCharacterOut] = []
    for r in rows:
        cid = r[0]
        base_system = (r[3] or "simplificado").strip() or "simplificado"
        out.append(
            GMCharacterOut(
                id=cid,
                name=r[1],
                concept=r[2],
                system=base_system,
                backstory=r[4],
                notes=r[5],
                systems=(sys_map.get(cid) or [base_system]),
                owner_email=r[6],
            )
        )
    return out

@gm_router.post("", status_code=201)
def create_any_character(
    data: CharacterCreateIn,
    gm: User = Depends(require_gm),
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
                "uid": gm.id,  # owner arbitrário p/ MVP: GM cria e fica como dono
                "name": data.name,
                "concept": data.concept,
                "system": base_system,
                "backstory": data.backstory,
                "notes": data.notes,
            },
        )
        character_id = session.exec(text("SELECT last_insert_rowid()")).one()[0]

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
    except Exception as e:
        session.exec(text("ROLLBACK"))
        raise HTTPException(status_code=500, detail=f"GM create failed: {e}")

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


@gm_router.put("/{character_id}")
def update_any_character(
    character_id: int,
    data: CharacterUpdateIn,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    row = session.exec(
        text(
            """
            SELECT id
            FROM character
            WHERE id = :cid AND kind='PC'
            """
        ),
        params={"cid": character_id},
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
        raise HTTPException(status_code=500, detail=f"GM update failed: {e}")

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


@router.delete("/{character_id}")
def delete_my_character(
    character_id: int,
    user: User = Depends(_require_player),
    session: Session = Depends(get_session),
):
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

    try:
        session.exec(text("BEGIN"))

        # limpa sistemas e dados conhecidos
        session.exec(
            text("DELETE FROM character_system WHERE character_id=:cid"),
            params={"cid": character_id},
        )

        # se existir Candela, limpa tabelas (seus helpers já lidam com isso)
        if _candela_exists(session, character_id):
            _candela_clear(session, character_id)

        session.exec(
            text("DELETE FROM character WHERE id=:cid"),
            params={"cid": character_id},
        )

        session.exec(text("COMMIT"))
    except Exception as e:
        session.exec(text("ROLLBACK"))
        raise HTTPException(status_code=500, detail=f"Delete failed: {e}")

    return {"ok": True}


@gm_router.delete("/{character_id}")
def delete_any_character(
    character_id: int,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    row = session.exec(
        text(
            """
            SELECT 1
            FROM character
            WHERE id = :cid AND kind='PC'
            """
        ),
        params={"cid": character_id},
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Character not found")

    try:
        session.exec(text("BEGIN"))

        session.exec(
            text("DELETE FROM character_system WHERE character_id=:cid"),
            params={"cid": character_id},
        )

        if _candela_exists(session, character_id):
            _candela_clear(session, character_id)

        session.exec(
            text("DELETE FROM character WHERE id=:cid"),
            params={"cid": character_id},
        )

        session.exec(text("COMMIT"))
    except Exception as e:
        session.exec(text("ROLLBACK"))
        raise HTTPException(status_code=500, detail=f"GM delete failed: {e}")

    return {"ok": True}

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
    data: CandelaUpsertIn = Body(...),
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

# apps/api/backend/routers/characters.py
# PASSO 4.2 (POST /{character_id}/systems/{system_key})
# Substitua do `if system_key == "simplificado":` ate o `return {"ok": True}` por:

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

        # cria base + defaults
        bootstrap_candela(session, character_id, int(data.role_id), int(data.specialty_id))

        # aplica sheet (sem backstory/notes aqui)
        session.exec(
            text(
                """
                UPDATE candela_character_sheet
                SET pronouns=:pronouns, circle=:circle, style=:style, catalyst=:catalyst, question=:question,
                    updated_at=datetime('now')
                WHERE character_id=:cid
                """
            ),
            params={
                "cid": character_id,
                "pronouns": data.pronouns or "",
                "circle": data.circle or "",
                "style": data.style or "",
                "catalyst": data.catalyst or "",
                "question": data.question or "",
            },
        )

        # role/specialty (se divergir do bootstrap, atualiza)
        session.exec(
            text(
                """
                UPDATE candela_character_choice
                SET role_id=:rid, specialty_id=:sid
                WHERE character_id=:cid
                """
            ),
            params={"cid": character_id, "rid": int(data.role_id), "sid": int(data.specialty_id)},
        )

        # overrides (UPSERT)
        for a in data.actions:
            session.exec(
                text(
                    """
                    INSERT INTO candela_character_action (character_id, action_key, group_key, rating, gilded)
                    VALUES (:cid, :ak,
                      CASE
                        WHEN :ak IN ('MOVER','ATACAR','CONTROLAR') THEN 'VIGOR'
                        WHEN :ak IN ('INFLUENCIAR','LER','ESCONDER') THEN 'ASTUCIA'
                        ELSE 'INTUICAO'
                      END,
                      :rt, :gd
                    )
                    ON CONFLICT(character_id, action_key)
                    DO UPDATE SET rating=excluded.rating, gilded=excluded.gilded
                    """
                ),
                params={"cid": character_id, "ak": a.action_key, "rt": int(a.rating), "gd": 1 if a.gilded else 0},
            )

        for g in data.group_state:
            session.exec(
                text(
                    """
                    INSERT INTO candela_character_group_state
                      (character_id, group_key, drive_current, drive_max, resist_current, resist_max)
                    VALUES (:cid,:gk,:dc,:dm,:rc,:rm)
                    ON CONFLICT(character_id, group_key)
                    DO UPDATE SET drive_current=excluded.drive_current, drive_max=excluded.drive_max,
                                 resist_current=excluded.resist_current, resist_max=excluded.resist_max
                    """
                ),
                params={
                    "cid": character_id,
                    "gk": g.group_key,
                    "dc": int(g.drive_current),
                    "dm": int(g.drive_max),
                    "rc": int(g.resist_current),
                    "rm": int(g.resist_max),
                },
            )

        for m in data.marks:
            session.exec(
                text(
                    """
                    INSERT INTO candela_character_mark (character_id, mark_key, current, max)
                    VALUES (:cid,:mk,:c,:m)
                    ON CONFLICT(character_id, mark_key)
                    DO UPDATE SET current=excluded.current, max=excluded.max
                    """
                ),
                params={"cid": character_id, "mk": m.mark_key, "c": int(m.current), "m": int(m.max)},
            )

        # lists: replace-all simples
        session.exec(text("DELETE FROM candela_character_relation WHERE character_id=:cid"), params={"cid": character_id})
        for it in data.relations:
            if (it.text or "").strip():
                session.exec(
                    text("INSERT INTO candela_character_relation (character_id, text) VALUES (:cid,:t)"),
                    params={"cid": character_id, "t": it.text.strip()},
                )

        session.exec(text("DELETE FROM candela_character_equipment WHERE character_id=:cid"), params={"cid": character_id})
        for it in data.equipment:
            if (it.text or "").strip():
                session.exec(
                    text("INSERT INTO candela_character_equipment (character_id, text) VALUES (:cid,:t)"),
                    params={"cid": character_id, "t": it.text.strip()},
                )

        session.exec(text("DELETE FROM candela_character_illumination_key WHERE character_id=:cid"), params={"cid": character_id})
        for it in data.illumination_keys:
            if (it.text or "").strip():
                session.exec(
                    text("INSERT INTO candela_character_illumination_key (character_id, text) VALUES (:cid,:t)"),
                    params={"cid": character_id, "t": it.text.strip()},
                )

        # scars: replace-all
        session.exec(text("DELETE FROM candela_character_scar WHERE character_id=:cid"), params={"cid": character_id})
        for sc in data.scars:
            if (sc.description or "").strip():
                session.exec(
                    text(
                        """
                        INSERT INTO candela_character_scar (character_id, mark_key, description)
                        VALUES (:cid,:mk,:d)
                        """
                    ),
                    params={"cid": character_id, "mk": sc.mark_key, "d": sc.description.strip()},
                )

        # powers
        session.exec(text("DELETE FROM candela_character_role_power_pick WHERE character_id=:cid"), params={"cid": character_id})
        for pid in data.role_power_ids:
            session.exec(
                text(
                    """
                    INSERT OR IGNORE INTO candela_character_role_power_pick (character_id, power_id)
                    VALUES (:cid,:pid)
                    """
                ),
                params={"cid": character_id, "pid": int(pid)},
            )

        if data.specialty_power_id is not None:
            session.exec(
                text(
                    """
                    INSERT INTO candela_character_specialty_power_pick (character_id, power_id)
                    VALUES (:cid,:pid)
                    ON CONFLICT(character_id) DO UPDATE SET power_id=excluded.power_id
                    """
                ),
                params={"cid": character_id, "pid": int(data.specialty_power_id)},
            )

        # abilities (requer migration 0006)
        session.exec(text("DELETE FROM candela_character_ability_pick WHERE character_id=:cid"), params={"cid": character_id})
        for aid in data.ability_ids:
            session.exec(
                text(
                    """
                    INSERT OR IGNORE INTO candela_character_ability_pick (character_id, ability_id)
                    VALUES (:cid,:aid)
                    """
                ),
                params={"cid": character_id, "aid": int(aid)},
            )

        session.exec(text("COMMIT"))
    except HTTPException:
        session.exec(text("ROLLBACK"))
        raise
    except Exception as e:
        session.exec(text("ROLLBACK"))
        raise HTTPException(status_code=500, detail=f"Create system failed: {e}")

    return {"ok": True}

@gm_router.get("/{character_id}/systems/candela_obscura")
def gm_get_candela_system(
    character_id: int,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    # valida só existência do personagem (sem owner)
    row = session.exec(
        text(
            """
            SELECT 1
            FROM character
            WHERE id = :cid AND kind='PC'
            """
        ),
        params={"cid": character_id},
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Character not found")

    if not _candela_exists(session, character_id):
        raise HTTPException(status_code=404, detail="Candela system not found")

    choice = session.exec(
        text("SELECT role_id, specialty_id FROM candela_character_choice WHERE character_id=:cid"),
        params={"cid": character_id},
    ).first()
    if not choice:
        raise HTTPException(status_code=500, detail="Candela data missing (choice)")

    sheet = session.exec(
        text(
            """
            SELECT pronouns, circle, style, catalyst, question
            FROM candela_character_sheet
            WHERE character_id=:cid
            """
        ),
        params={"cid": character_id},
    ).first()
    if not sheet:
        raise HTTPException(status_code=500, detail="Candela data missing (sheet)")

    actions = session.exec(
        text(
            """
            SELECT action_key, rating, COALESCE(gilded,0)
            FROM candela_character_action
            WHERE character_id=:cid
            ORDER BY action_key
            """
        ),
        params={"cid": character_id},
    ).all()

    groups = session.exec(
        text(
            """
            SELECT group_key, drive_current, drive_max, resist_current, resist_max
            FROM candela_character_group_state
            WHERE character_id=:cid
            ORDER BY group_key
            """
        ),
        params={"cid": character_id},
    ).all()

    marks = session.exec(
        text(
            """
            SELECT mark_key, current, max
            FROM candela_character_mark
            WHERE character_id=:cid
            ORDER BY mark_key
            """
        ),
        params={"cid": character_id},
    ).all()

    scars = session.exec(
        text(
            """
            SELECT id, mark_key, description
            FROM candela_character_scar
            WHERE character_id=:cid
            ORDER BY id
            """
        ),
        params={"cid": character_id},
    ).all()

    rels = session.exec(
        text("SELECT id, text FROM candela_character_relation WHERE character_id=:cid ORDER BY id"),
        params={"cid": character_id},
    ).all()

    eq = session.exec(
        text("SELECT id, text FROM candela_character_equipment WHERE character_id=:cid ORDER BY id"),
        params={"cid": character_id},
    ).all()

    keys = session.exec(
        text("SELECT id, text FROM candela_character_illumination_key WHERE character_id=:cid ORDER BY id"),
        params={"cid": character_id},
    ).all()

    role_picks = session.exec(
        text("SELECT power_id FROM candela_character_role_power_pick WHERE character_id=:cid ORDER BY power_id"),
        params={"cid": character_id},
    ).all()

    sp_pick = session.exec(
        text("SELECT power_id FROM candela_character_specialty_power_pick WHERE character_id=:cid"),
        params={"cid": character_id},
    ).first()

    ability_picks = session.exec(
        text("SELECT ability_id FROM candela_character_ability_pick WHERE character_id=:cid ORDER BY ability_id"),
        params={"cid": character_id},
    ).all()

    return CandelaOut(
        role_id=int(choice[0]),
        specialty_id=int(choice[1]),
        pronouns=sheet[0] or "",
        circle=sheet[1] or "",
        style=sheet[2] or "",
        catalyst=sheet[3] or "",
        question=sheet[4] or "",
        actions=[{"action_key": a, "rating": int(r), "gilded": bool(g)} for (a, r, g) in actions],
        group_state=[
            {
                "group_key": gk,
                "drive_current": int(dc),
                "drive_max": int(dm),
                "resist_current": int(rc),
                "resist_max": int(rm),
            }
            for (gk, dc, dm, rc, rm) in groups
        ],
        marks=[{"mark_key": mk, "current": int(c), "max": int(m)} for (mk, c, m) in marks],
        scars=[{"id": int(i), "mark_key": mk, "description": d} for (i, mk, d) in scars],
        relations=[{"id": int(i), "text": t} for (i, t) in rels],
        equipment=[{"id": int(i), "text": t} for (i, t) in eq],
        illumination_keys=[{"id": int(i), "text": t} for (i, t) in keys],
        role_power_ids=[int(r[0]) for r in role_picks],
        specialty_power_id=int(sp_pick[0]) if sp_pick else None,
        ability_ids=[int(a[0]) for a in ability_picks],
    )

@gm_router.put("/{character_id}/systems/candela_obscura")
def gm_update_candela_system(
    character_id: int,
    data: CandelaUpsertIn,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    # valida só existência do personagem (sem owner)
    row = session.exec(
        text(
            """
            SELECT 1
            FROM character
            WHERE id = :cid AND kind='PC'
            """
        ),
        params={"cid": character_id},
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Character not found")

    if not _candela_exists(session, character_id):
        raise HTTPException(status_code=404, detail="Candela system not found")

    try:
        session.exec(text("BEGIN"))

        current = session.exec(
            text("SELECT role_id, specialty_id FROM candela_character_choice WHERE character_id=:cid"),
            params={"cid": character_id},
        ).first()
        if not current:
            raise HTTPException(status_code=404, detail="Candela sheet not found")

        cur_role_id, cur_specialty_id = int(current[0]), int(current[1])

        if cur_role_id != int(data.role_id) or cur_specialty_id != int(data.specialty_id):
            _candela_clear(session, character_id)
            bootstrap_candela(session, character_id, int(data.role_id), int(data.specialty_id))
        else:
            session.exec(
                text(
                    """
                    INSERT OR IGNORE INTO candela_character_sheet (character_id)
                    VALUES (:cid)
                    """
                ),
                params={"cid": character_id},
            )

        session.exec(
            text(
                """
                UPDATE candela_character_sheet
                SET pronouns=:pronouns, circle=:circle, style=:style, catalyst=:catalyst, question=:question,
                    updated_at=datetime('now')
                WHERE character_id=:cid
                """
            ),
            params={
                "cid": character_id,
                "pronouns": data.pronouns or "",
                "circle": data.circle or "",
                "style": data.style or "",
                "catalyst": data.catalyst or "",
                "question": data.question or "",
            },
        )

        session.exec(
            text(
                """
                UPDATE candela_character_choice
                SET role_id=:rid, specialty_id=:sid
                WHERE character_id=:cid
                """
            ),
            params={"cid": character_id, "rid": int(data.role_id), "sid": int(data.specialty_id)},
        )

        for a in data.actions:
            session.exec(
                text(
                    """
                    INSERT INTO candela_character_action (character_id, action_key, group_key, rating, gilded)
                    VALUES (:cid, :ak,
                      CASE
                        WHEN :ak IN ('MOVER','ATACAR','CONTROLAR') THEN 'VIGOR'
                        WHEN :ak IN ('INFLUENCIAR','LER','ESCONDER') THEN 'ASTUCIA'
                        ELSE 'INTUICAO'
                      END,
                      :rt, :gd
                    )
                    ON CONFLICT(character_id, action_key)
                    DO UPDATE SET rating=excluded.rating, gilded=excluded.gilded
                    """
                ),
                params={"cid": character_id, "ak": a.action_key, "rt": int(a.rating), "gd": 1 if a.gilded else 0},
            )

        for g in data.group_state:
            session.exec(
                text(
                    """
                    INSERT INTO candela_character_group_state
                      (character_id, group_key, drive_current, drive_max, resist_current, resist_max)
                    VALUES (:cid,:gk,:dc,:dm,:rc,:rm)
                    ON CONFLICT(character_id, group_key)
                    DO UPDATE SET drive_current=excluded.drive_current, drive_max=excluded.drive_max,
                                 resist_current=excluded.resist_current, resist_max=excluded.resist_max
                    """
                ),
                params={
                    "cid": character_id,
                    "gk": g.group_key,
                    "dc": int(g.drive_current),
                    "dm": int(g.drive_max),
                    "rc": int(g.resist_current),
                    "rm": int(g.resist_max),
                },
            )

        for m in data.marks:
            session.exec(
                text(
                    """
                    INSERT INTO candela_character_mark (character_id, mark_key, current, max)
                    VALUES (:cid,:mk,:c,:m)
                    ON CONFLICT(character_id, mark_key)
                    DO UPDATE SET current=excluded.current, max=excluded.max
                    """
                ),
                params={"cid": character_id, "mk": m.mark_key, "c": int(m.current), "m": int(m.max)},
            )

        session.exec(text("DELETE FROM candela_character_relation WHERE character_id=:cid"), params={"cid": character_id})
        for it in data.relations:
            if (it.text or "").strip():
                session.exec(
                    text("INSERT INTO candela_character_relation (character_id, text) VALUES (:cid,:t)"),
                    params={"cid": character_id, "t": it.text.strip()},
                )

        session.exec(text("DELETE FROM candela_character_equipment WHERE character_id=:cid"), params={"cid": character_id})
        for it in data.equipment:
            if (it.text or "").strip():
                session.exec(
                    text("INSERT INTO candela_character_equipment (character_id, text) VALUES (:cid,:t)"),
                    params={"cid": character_id, "t": it.text.strip()},
                )

        session.exec(text("DELETE FROM candela_character_illumination_key WHERE character_id=:cid"), params={"cid": character_id})
        for it in data.illumination_keys:
            if (it.text or "").strip():
                session.exec(
                    text("INSERT INTO candela_character_illumination_key (character_id, text) VALUES (:cid,:t)"),
                    params={"cid": character_id, "t": it.text.strip()},
                )

        session.exec(text("DELETE FROM candela_character_scar WHERE character_id=:cid"), params={"cid": character_id})
        for sc in data.scars:
            if (sc.description or "").strip():
                session.exec(
                    text(
                        """
                        INSERT INTO candela_character_scar (character_id, mark_key, description)
                        VALUES (:cid,:mk,:d)
                        """
                    ),
                    params={"cid": character_id, "mk": sc.mark_key, "d": sc.description.strip()},
                )

        session.exec(text("DELETE FROM candela_character_role_power_pick WHERE character_id=:cid"), params={"cid": character_id})
        for pid in data.role_power_ids:
            session.exec(
                text(
                    """
                    INSERT OR IGNORE INTO candela_character_role_power_pick (character_id, power_id)
                    VALUES (:cid,:pid)
                    """
                ),
                params={"cid": character_id, "pid": int(pid)},
            )

        if data.specialty_power_id is not None:
            session.exec(
                text(
                    """
                    INSERT INTO candela_character_specialty_power_pick (character_id, power_id)
                    VALUES (:cid,:pid)
                    ON CONFLICT(character_id) DO UPDATE SET power_id=excluded.power_id
                    """
                ),
                params={"cid": character_id, "pid": int(data.specialty_power_id)},
            )

        session.exec(text("DELETE FROM candela_character_ability_pick WHERE character_id=:cid"), params={"cid": character_id})
        for aid in data.ability_ids:
            session.exec(
                text(
                    """
                    INSERT OR IGNORE INTO candela_character_ability_pick (character_id, ability_id)
                    VALUES (:cid,:aid)
                    """
                ),
                params={"cid": character_id, "aid": int(aid)},
            )

        session.exec(text("COMMIT"))
    except HTTPException:
        session.exec(text("ROLLBACK"))
        raise
    except Exception as e:
        session.exec(text("ROLLBACK"))
        raise HTTPException(status_code=500, detail=f"GM Update Candela failed: {e}")

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
        text("SELECT role_id, specialty_id FROM candela_character_choice WHERE character_id=:cid"),
        params={"cid": character_id},
    ).first()
    if not choice:
        raise HTTPException(status_code=500, detail="Candela data missing (choice)")

    sheet = session.exec(
        text(
            """
            SELECT pronouns, circle, style, catalyst, question
            FROM candela_character_sheet
            WHERE character_id=:cid
            """
        ),
        params={"cid": character_id},
    ).first()
    if not sheet:
        raise HTTPException(status_code=500, detail="Candela data missing (sheet)")

    actions = session.exec(
        text(
            """
            SELECT action_key, rating, COALESCE(gilded,0)
            FROM candela_character_action
            WHERE character_id=:cid
            ORDER BY action_key
            """
        ),
        params={"cid": character_id},
    ).all()

    groups = session.exec(
        text(
            """
            SELECT group_key, drive_current, drive_max, resist_current, resist_max
            FROM candela_character_group_state
            WHERE character_id=:cid
            ORDER BY group_key
            """
        ),
        params={"cid": character_id},
    ).all()

    marks = session.exec(
        text(
            """
            SELECT mark_key, current, max
            FROM candela_character_mark
            WHERE character_id=:cid
            ORDER BY mark_key
            """
        ),
        params={"cid": character_id},
    ).all()

    scars = session.exec(
        text(
            """
            SELECT id, mark_key, description
            FROM candela_character_scar
            WHERE character_id=:cid
            ORDER BY id
            """
        ),
        params={"cid": character_id},
    ).all()

    rels = session.exec(
        text("SELECT id, text FROM candela_character_relation WHERE character_id=:cid ORDER BY id"),
        params={"cid": character_id},
    ).all()

    eq = session.exec(
        text("SELECT id, text FROM candela_character_equipment WHERE character_id=:cid ORDER BY id"),
        params={"cid": character_id},
    ).all()

    keys = session.exec(
        text("SELECT id, text FROM candela_character_illumination_key WHERE character_id=:cid ORDER BY id"),
        params={"cid": character_id},
    ).all()

    role_picks = session.exec(
        text("SELECT power_id FROM candela_character_role_power_pick WHERE character_id=:cid ORDER BY power_id"),
        params={"cid": character_id},
    ).all()

    sp_pick = session.exec(
        text("SELECT power_id FROM candela_character_specialty_power_pick WHERE character_id=:cid"),
        params={"cid": character_id},
    ).first()

    ability_picks = session.exec(
        text("SELECT ability_id FROM candela_character_ability_pick WHERE character_id=:cid ORDER BY ability_id"),
        params={"cid": character_id},
    ).all()

    return CandelaOut(
        role_id=int(choice[0]),
        specialty_id=int(choice[1]),
        pronouns=sheet[0] or "",
        circle=sheet[1] or "",
        style=sheet[2] or "",
        catalyst=sheet[3] or "",
        question=sheet[4] or "",
        actions=[{"action_key": a, "rating": int(r), "gilded": bool(g)} for (a, r, g) in actions],
        group_state=[
            {
                "group_key": gk,
                "drive_current": int(dc),
                "drive_max": int(dm),
                "resist_current": int(rc),
                "resist_max": int(rm),
            }
            for (gk, dc, dm, rc, rm) in groups
        ],
        marks=[{"mark_key": mk, "current": int(c), "max": int(m)} for (mk, c, m) in marks],
        scars=[{"id": int(i), "mark_key": mk, "description": d} for (i, mk, d) in scars],
        relations=[{"id": int(i), "text": t} for (i, t) in rels],
        equipment=[{"id": int(i), "text": t} for (i, t) in eq],
        illumination_keys=[{"id": int(i), "text": t} for (i, t) in keys],
        role_power_ids=[int(r[0]) for r in role_picks],
        specialty_power_id=int(sp_pick[0]) if sp_pick else None,
        ability_ids=[int(a[0]) for a in ability_picks],
    )


@router.put("/{character_id}/systems/candela_obscura")
def update_candela_system(
    character_id: int,
    data: CandelaUpsertIn,
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

        current = session.exec(
            text("SELECT role_id, specialty_id FROM candela_character_choice WHERE character_id=:cid"),
            params={"cid": character_id},
        ).first()
        if not current:
            raise HTTPException(status_code=404, detail="Candela sheet not found")

        cur_role_id, cur_specialty_id = int(current[0]), int(current[1])

        # se mudou role/specialty, faz rebuild para reaplicar defaults do BE
        if cur_role_id != int(data.role_id) or cur_specialty_id != int(data.specialty_id):
            _candela_clear(session, character_id)
            bootstrap_candela(session, character_id, int(data.role_id), int(data.specialty_id))
        else:
            # garante que existe sheet (caso antigo)
            session.exec(
                text(
                    """
                    INSERT OR IGNORE INTO candela_character_sheet (character_id)
                    VALUES (:cid)
                    """
                ),
                params={"cid": character_id},
            )

        # sheet (sem backstory/notes aqui)
        session.exec(
            text(
                """
                UPDATE candela_character_sheet
                SET pronouns=:pronouns, circle=:circle, style=:style, catalyst=:catalyst, question=:question,
                    updated_at=datetime('now')
                WHERE character_id=:cid
                """
            ),
            params={
                "cid": character_id,
                "pronouns": data.pronouns or "",
                "circle": data.circle or "",
                "style": data.style or "",
                "catalyst": data.catalyst or "",
                "question": data.question or "",
            },
        )

        # role/specialty
        session.exec(
            text(
                """
                UPDATE candela_character_choice
                SET role_id=:rid, specialty_id=:sid
                WHERE character_id=:cid
                """
            ),
            params={"cid": character_id, "rid": int(data.role_id), "sid": int(data.specialty_id)},
        )

        # actions (UPSERT)
        for a in data.actions:
            session.exec(
                text(
                    """
                    INSERT INTO candela_character_action (character_id, action_key, group_key, rating, gilded)
                    VALUES (:cid, :ak,
                      CASE
                        WHEN :ak IN ('MOVER','ATACAR','CONTROLAR') THEN 'VIGOR'
                        WHEN :ak IN ('INFLUENCIAR','LER','ESCONDER') THEN 'ASTUCIA'
                        ELSE 'INTUICAO'
                      END,
                      :rt, :gd
                    )
                    ON CONFLICT(character_id, action_key)
                    DO UPDATE SET rating=excluded.rating, gilded=excluded.gilded
                    """
                ),
                params={"cid": character_id, "ak": a.action_key, "rt": int(a.rating), "gd": 1 if a.gilded else 0},
            )

        # group state (UPSERT)
        for g in data.group_state:
            session.exec(
                text(
                    """
                    INSERT INTO candela_character_group_state
                      (character_id, group_key, drive_current, drive_max, resist_current, resist_max)
                    VALUES (:cid,:gk,:dc,:dm,:rc,:rm)
                    ON CONFLICT(character_id, group_key)
                    DO UPDATE SET drive_current=excluded.drive_current, drive_max=excluded.drive_max,
                                 resist_current=excluded.resist_current, resist_max=excluded.resist_max
                    """
                ),
                params={
                    "cid": character_id,
                    "gk": g.group_key,
                    "dc": int(g.drive_current),
                    "dm": int(g.drive_max),
                    "rc": int(g.resist_current),
                    "rm": int(g.resist_max),
                },
            )

        # marks (UPSERT)
        for m in data.marks:
            session.exec(
                text(
                    """
                    INSERT INTO candela_character_mark (character_id, mark_key, current, max)
                    VALUES (:cid,:mk,:c,:m)
                    ON CONFLICT(character_id, mark_key)
                    DO UPDATE SET current=excluded.current, max=excluded.max
                    """
                ),
                params={"cid": character_id, "mk": m.mark_key, "c": int(m.current), "m": int(m.max)},
            )

        # lists: replace-all
        session.exec(text("DELETE FROM candela_character_relation WHERE character_id=:cid"), params={"cid": character_id})
        for it in data.relations:
            if (it.text or "").strip():
                session.exec(
                    text("INSERT INTO candela_character_relation (character_id, text) VALUES (:cid,:t)"),
                    params={"cid": character_id, "t": it.text.strip()},
                )

        session.exec(text("DELETE FROM candela_character_equipment WHERE character_id=:cid"), params={"cid": character_id})
        for it in data.equipment:
            if (it.text or "").strip():
                session.exec(
                    text("INSERT INTO candela_character_equipment (character_id, text) VALUES (:cid,:t)"),
                    params={"cid": character_id, "t": it.text.strip()},
                )

        session.exec(text("DELETE FROM candela_character_illumination_key WHERE character_id=:cid"), params={"cid": character_id})
        for it in data.illumination_keys:
            if (it.text or "").strip():
                session.exec(
                    text("INSERT INTO candela_character_illumination_key (character_id, text) VALUES (:cid,:t)"),
                    params={"cid": character_id, "t": it.text.strip()},
                )

        # scars: replace-all
        session.exec(text("DELETE FROM candela_character_scar WHERE character_id=:cid"), params={"cid": character_id})
        for sc in data.scars:
            if (sc.description or "").strip():
                session.exec(
                    text(
                        """
                        INSERT INTO candela_character_scar (character_id, mark_key, description)
                        VALUES (:cid,:mk,:d)
                        """
                    ),
                    params={"cid": character_id, "mk": sc.mark_key, "d": sc.description.strip()},
                )

        # powers: role picks replace-all
        session.exec(text("DELETE FROM candela_character_role_power_pick WHERE character_id=:cid"), params={"cid": character_id})
        for pid in data.role_power_ids:
            session.exec(
                text(
                    """
                    INSERT OR IGNORE INTO candela_character_role_power_pick (character_id, power_id)
                    VALUES (:cid,:pid)
                    """
                ),
                params={"cid": character_id, "pid": int(pid)},
            )

        # specialty power: 1
        if data.specialty_power_id is not None:
            session.exec(
                text(
                    """
                    INSERT INTO candela_character_specialty_power_pick (character_id, power_id)
                    VALUES (:cid,:pid)
                    ON CONFLICT(character_id) DO UPDATE SET power_id=excluded.power_id
                    """
                ),
                params={"cid": character_id, "pid": int(data.specialty_power_id)},
            )

        # abilities: replace-all (requer migration 0006)
        session.exec(text("DELETE FROM candela_character_ability_pick WHERE character_id=:cid"), params={"cid": character_id})
        for aid in data.ability_ids:
            session.exec(
                text(
                    """
                    INSERT OR IGNORE INTO candela_character_ability_pick (character_id, ability_id)
                    VALUES (:cid,:aid)
                    """
                ),
                params={"cid": character_id, "aid": int(aid)},
            )

        session.exec(text("COMMIT"))
    except HTTPException:
        session.exec(text("ROLLBACK"))
        raise
    except Exception as e:
        session.exec(text("ROLLBACK"))
        raise HTTPException(status_code=500, detail=f"Update Candela failed: {e}")

    return {"ok": True}