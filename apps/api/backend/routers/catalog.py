from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlmodel import Session
from apps.api.backend.db import get_session
from typing import Optional

router = APIRouter(prefix="/catalog", tags=["catalog"])

def _cols(session: Session, table: str) -> set[str]:
    rows = session.exec(text(f"PRAGMA table_info({table})")).all()
    # row = (cid, name, type, notnull, dflt_value, pk)
    return {r[1] for r in rows}

@router.get("/systems")
def systems():
    return [
        {"key": "candela_obscura", "label": "Candela Obscura"},
    ]

@router.get("/candela/roles")
def candela_roles(session: Session = Depends(get_session)):
    c = _cols(session, "candela_role")
    has_desc = "description" in c
    if has_desc:
        rows = session.exec(text("SELECT id, name, COALESCE(description,'') FROM candela_role ORDER BY name")).all()
        return [{"id": r[0], "name": r[1], "description": r[2]} for r in rows]
    rows = session.exec(text("SELECT id, name FROM candela_role ORDER BY name")).all()
    return [{"id": r[0], "name": r[1], "description": ""} for r in rows]

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlmodel import Session
from apps.api.backend.db import get_session

@router.get("/candela/specialties")
def candela_specialties(
    role_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
):
    if role_id is None:
        return []

    q = text("""
        SELECT id, name, role_id,
            COALESCE(description,'') AS description,
            COALESCE(image_storage_key,'') AS image_storage_key
        FROM candela_specialty
        WHERE role_id = :role_id
        ORDER BY name
    """).bindparams(role_id=role_id)

    rows = session.exec(q).all()

    return [
        {"id": r[0], "name": r[1], "role_id": r[2], "description": r[3], "image_storage_key": r[4]}
        for r in rows
    ]

