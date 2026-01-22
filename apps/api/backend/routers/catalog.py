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
@router.get("/candela/specialty/defaults")
def candela_specialty_defaults(
    specialty_id: int = Query(...),
    session: Session = Depends(get_session),
):
    actions = session.exec(
        text(
            """
            SELECT action_key, rating, COALESCE(gilded_default,0)
            FROM candela_specialty_action_default
            WHERE specialty_id=:sid
            ORDER BY action_key
            """
        ),
        params={"sid": specialty_id},
    ).all()

    groups = session.exec(
        text(
            """
            SELECT group_key, drive_default
            FROM candela_specialty_group_default
            WHERE specialty_id=:sid
            ORDER BY group_key
            """
        ),
        params={"sid": specialty_id},
    ).all()

    sp_power = session.exec(
        text(
            """
            SELECT power_id
            FROM candela_specialty_power
            WHERE specialty_id=:sid
            """
        ),
        params={"sid": specialty_id},
    ).first()

    return {
        "actions": [{"action_key": a, "rating": int(r), "gilded_default": int(g)} for (a, r, g) in actions],
        "groups": [{"group_key": gk, "drive_default": int(dd)} for (gk, dd) in groups],
        "specialty_power_id": int(sp_power[0]) if sp_power else None,
    }


@router.get("/candela/role/powers")
def candela_role_powers(
    role_id: int = Query(...),
    session: Session = Depends(get_session),
):
    rows = session.exec(
        text(
            """
            SELECT p.id, p.name, COALESCE(p.description,'')
            FROM candela_role_power rp
            JOIN candela_power p ON p.id = rp.power_id
            WHERE rp.role_id = :rid
            ORDER BY p.name
            """
        ),
        params={"rid": role_id},
    ).all()
    return [{"id": int(i), "name": n, "description": d} for (i, n, d) in rows]

@router.get("/candela/abilities")
def candela_abilities(
    role_id: Optional[int] = Query(default=None),
    specialty_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
):
    out = {"role": [], "specialty": []}

    if role_id is not None:
        rows = session.exec(
            text(
                """
                SELECT id, name, description
                FROM candela_ability
                WHERE scope='ROLE' AND role_id=:rid
                ORDER BY name
                """
            ),
            params={"rid": role_id},
        ).all()
        out["role"] = [{"id": int(i), "name": n, "description": d} for (i, n, d) in rows]

    if specialty_id is not None:
        rows = session.exec(
            text(
                """
                SELECT id, name, description
                FROM candela_ability
                WHERE scope='SPECIALTY' AND specialty_id=:sid
                ORDER BY name
                """
            ),
            params={"sid": specialty_id},
        ).all()
        out["specialty"] = [{"id": int(i), "name": n, "description": d} for (i, n, d) in rows]

    return out

