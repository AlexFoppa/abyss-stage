# apps/api/backend/routers/characters.py
from __future__ import annotations
import os
import uuid
import hashlib
import time

from pathlib import Path
from fastapi import UploadFile, File
from fastapi import APIRouter, Body, Depends, HTTPException, File, UploadFile, Form
from pydantic import BaseModel, Field
from sqlmodel import Session
from sqlalchemy import text
from urllib.parse import quote
from typing import Optional
from apps.api.backend.db import get_session
from apps.api.backend.routers.auth import get_current_user, require_gm
from apps.api.backend.models.user import User, Role
from apps.api.backend.routers.candela_bootstrap import bootstrap_candela
from typing import Optional

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
    default_image_url: Optional[str] = None
    default_image_rev: Optional[str] = None



class GMCharacterOut(CharacterOut):
    owner_email: str

class CharacterImageOut(BaseModel):
    slot: int
    storage_key: str
    url: str

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

def _uploads_root() -> Path:
    p = Path("uploads")
    p.mkdir(parents=True, exist_ok=True)
    return p

def _img_url(storage_key: str, rev: Optional[str] = None) -> str:
    storage_key = (storage_key or "").lstrip("/")
    url = f"/api/uploads/{storage_key}"
    if rev:
        url += f"?v={quote(rev)}"
    return url

def _sha256_bytes(data: bytes) -> str:
    h = hashlib.sha256()
    h.update(data)
    return h.hexdigest()


def _gm_require_character_exists(session: Session, character_id: int) -> None:
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


def _ensure_upload_dir(character_id: int) -> str:
    # guarda em ./uploads/characters/<id>/
    base = os.path.join("uploads", "characters", str(character_id))
    os.makedirs(base, exist_ok=True)
    return base


def _save_upload(character_id: int, up: UploadFile) -> tuple[str, str, int, str]:
    raw = up.file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")

    sha = hashlib.sha256(raw).hexdigest()
    mime = (up.content_type or "").strip() or None

    ext = ""
    if up.filename and "." in up.filename:
        ext = "." + up.filename.split(".")[-1].lower().strip()
        if len(ext) > 10:
            ext = ""

    fname = f"{uuid.uuid4().hex}{ext}"
    folder = _ensure_upload_dir(character_id)
    abs_path = os.path.join(folder, fname)

    with open(abs_path, "wb") as f:
        f.write(raw)

    # storage_key é relativo ao mount /uploads
    storage_key = f"characters/{character_id}/{fname}"
    return storage_key, (mime or ""), len(raw), sha


@gm_router.get("/{character_id}/images")
def gm_list_character_images(
    character_id: int,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    _gm_require_character_exists(session, character_id)

    rows = session.exec(
        text(
            """
            SELECT slot, storage_key, mime, size_bytes, sha256, created_at
            FROM character_image
            WHERE character_id=:cid
            ORDER BY slot ASC
            """
        ),
        params={"cid": character_id},
    ).all()

    return [
        {
            "slot": int(r[0]),
            "storage_key": r[1],
            "mime": r[2],
            "size_bytes": r[3],
            "sha256": r[4],
            "created_at": r[5],
        }
        for r in rows
    ]


@gm_router.post("/{character_id}/images", status_code=201)
def gm_upload_character_image(
    character_id: int,
    file: UploadFile = File(...),
    slot: Optional[int] = Form(None),  # se None, escolhe 1º livre (0..9)
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    _gm_require_character_exists(session, character_id)

    if slot is not None and (slot < 0 or slot > 9):
        raise HTTPException(status_code=400, detail="Invalid slot (0..9)")

    # escolhe slot se não veio
    if slot is None:
        used = session.exec(
            text("SELECT slot FROM character_image WHERE character_id=:cid"),
            params={"cid": character_id},
        ).all()
        used_set = {int(r[0]) for r in used}
        free = [s for s in range(10) if s not in used_set]
        if not free:
            raise HTTPException(status_code=409, detail="No free slots (0..9)")
        # se ainda não existe default, prioriza 0; senão usa o menor livre >=1
        if 0 in free:
            slot = 0
        else:
            slot = min(free)

    storage_key, mime, size_bytes, sha = _save_upload(character_id, file)

    try:
        session.exec(text("BEGIN"))

        # substitui o slot (DELETE+INSERT) para evitar conflito de PK
        session.exec(
            text("DELETE FROM character_image WHERE character_id=:cid AND slot=:slot"),
            params={"cid": character_id, "slot": int(slot)},
        )
        session.exec(
            text(
                """
                INSERT INTO character_image (character_id, slot, storage_key, mime, size_bytes, sha256)
                VALUES (:cid, :slot, :sk, :mime, :sz, :sha)
                """
            ),
            params={
                "cid": character_id,
                "slot": int(slot),
                "sk": storage_key,
                "mime": mime,
                "sz": int(size_bytes),
                "sha": sha,
            },
        )

        session.exec(text("COMMIT"))
    except Exception as e:
        session.exec(text("ROLLBACK"))
        raise HTTPException(status_code=500, detail=f"Upload image failed: {e}")

    return {"slot": int(slot), "storage_key": storage_key}


@gm_router.put("/{character_id}/images/default")
def gm_set_default_character_image(
    character_id: int,
    payload: dict = Body(...),
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    _gm_require_character_exists(session, character_id)

    slot = payload.get("slot", None)
    if not isinstance(slot, int) or slot < 0 or slot > 9:
        raise HTTPException(status_code=400, detail="slot must be int (0..9)")

    if slot == 0:
        return {"ok": True}

    # precisa existir imagem no slot alvo
    row_src = session.exec(
        text(
            """
            SELECT storage_key, mime, size_bytes, sha256, created_at
            FROM character_image
            WHERE character_id=:cid AND slot=:slot
            """
        ),
        params={"cid": character_id, "slot": slot},
    ).first()
    if not row_src:
        raise HTTPException(status_code=404, detail="Image not found for slot")

    row_dst = session.exec(
        text(
            """
            SELECT storage_key, mime, size_bytes, sha256, created_at
            FROM character_image
            WHERE character_id=:cid AND slot=0
            """
        ),
        params={"cid": character_id},
    ).first()

    try:
        session.exec(text("BEGIN"))

        # remove os dois slots e reinsere invertido (slot 0 vira default)
        session.exec(
            text("DELETE FROM character_image WHERE character_id=:cid AND slot IN (0, :slot)"),
            params={"cid": character_id, "slot": slot},
        )

        # insere novo default (slot 0)
        session.exec(
            text(
                """
                INSERT INTO character_image (character_id, slot, storage_key, mime, size_bytes, sha256, created_at)
                VALUES (:cid, 0, :sk, :mime, :sz, :sha, :created)
                """
            ),
            params={
                "cid": character_id,
                "sk": row_src[0],
                "mime": row_src[1],
                "sz": row_src[2],
                "sha": row_src[3],
                "created": row_src[4],
            },
        )

        # se tinha default antes, ele vai pro slot antigo
        if row_dst:
            session.exec(
                text(
                    """
                    INSERT INTO character_image (character_id, slot, storage_key, mime, size_bytes, sha256, created_at)
                    VALUES (:cid, :slot, :sk, :mime, :sz, :sha, :created)
                    """
                ),
                params={
                    "cid": character_id,
                    "slot": slot,
                    "sk": row_dst[0],
                    "mime": row_dst[1],
                    "sz": row_dst[2],
                    "sha": row_dst[3],
                    "created": row_dst[4],
                },
            )

        session.exec(text("COMMIT"))
    except Exception as e:
        session.exec(text("ROLLBACK"))
        raise HTTPException(status_code=500, detail=f"Set default failed: {e}")

    return {"ok": True}


@gm_router.delete("/{character_id}/images/{slot}")
def gm_delete_character_image(
    character_id: int,
    slot: int,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    _gm_require_character_exists(session, character_id)

    if slot < 0 or slot > 9:
        raise HTTPException(status_code=400, detail="Invalid slot (0..9)")

    row = session.exec(
        text(
            """
            SELECT storage_key
            FROM character_image
            WHERE character_id=:cid AND slot=:slot
            """
        ),
        params={"cid": character_id, "slot": slot},
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Image not found")

    storage_key = row[0]
    abs_path = os.path.join("uploads", storage_key)

    try:
        session.exec(text("BEGIN"))

        session.exec(
            text("DELETE FROM character_image WHERE character_id=:cid AND slot=:slot"),
            params={"cid": character_id, "slot": slot},
        )

        # se apagou o default e existe outra imagem, promove a menor slot para 0
        if slot == 0:
            nxt = session.exec(
                text(
                    """
                    SELECT slot
                    FROM character_image
                    WHERE character_id=:cid
                    ORDER BY slot ASC
                    LIMIT 1
                    """
                ),
                params={"cid": character_id},
            ).first()
            if nxt:
                session.exec(text("COMMIT"))
                # promove fora da txn antiga, usando o endpoint lógico
                # (swap seguro via gm_set_default_character_image)
                gm_set_default_character_image(character_id, {"slot": int(nxt[0])}, gm, session)  # type: ignore
                return {"ok": True}

        session.exec(text("COMMIT"))
    except Exception as e:
        session.exec(text("ROLLBACK"))
        raise HTTPException(status_code=500, detail=f"Delete image failed: {e}")

    try:
        if os.path.exists(abs_path):
            os.remove(abs_path)
    except Exception:
        pass

    return {"ok": True}

def _load_default_image_map(session: Session, character_ids: list[int]) -> dict[int, tuple[str, str]]:
    """
    Retorna: { character_id: (url, rev) } para slot 0.
    rev usa created_at (string do sqlite) para cache-busting no front.
    """
    ids = [int(x) for x in (character_ids or []) if isinstance(x, int) or str(x).isdigit()]
    if not ids:
        return {}

    ph = ",".join([f":id{i}" for i in range(len(ids))])
    params = {f"id{i}": ids[i] for i in range(len(ids))}

    rows = session.exec(
        text(
            f"""
            SELECT character_id, storage_key, created_at
            FROM character_image
            WHERE slot=0 AND character_id IN ({ph})
            """
        ),
        params=params,
    ).all()

    out: dict[int, tuple[str, str]] = {}
    for r in rows:
        cid = int(r[0])
        sk = str(r[1] or "")
        created = str(r[2] or "")
        if sk:
            out[cid] = (_img_url(sk, created), created)
    return out

@router.get("/{character_id}/images")
def list_my_character_images(
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

    rows = session.exec(
        text(
            """
            SELECT slot, storage_key, mime, size_bytes, sha256, created_at
            FROM character_image
            WHERE character_id=:cid
            ORDER BY slot ASC
            """
        ),
        params={"cid": character_id},
    ).all()

    return [
        {
            "slot": int(r[0]),
            "storage_key": r[1],
            "mime": r[2],
            "size_bytes": r[3],
            "sha256": r[4],
            "created_at": r[5],
        }
        for r in rows
    ]

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
    img_map = _load_default_image_map(session, ids)

    out: list[CharacterOut] = []
    for r in rows:
        cid = r[0]
        base_system = (r[3] or "simplificado").strip() or "simplificado"
        img = img_map.get(cid)

        out.append(
            CharacterOut(
                id=cid,
                name=r[1],
                concept=r[2],
                system=base_system,
                backstory=r[4],
                notes=r[5],
                systems=(sys_map.get(cid) or [base_system]),
                default_image_url=img[0] if img else None,
                default_image_rev=img[1] if img else None,
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
    img_map = _load_default_image_map(session, ids)

    out: list[GMCharacterOut] = []
    for r in rows:
        cid = r[0]
        base_system = (r[3] or "simplificado").strip() or "simplificado"
        img = img_map.get(cid)
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
                default_image_url=img[0] if img else None,
                default_image_rev=img[1] if img else None,
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