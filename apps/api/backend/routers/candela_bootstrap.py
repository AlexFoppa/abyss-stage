# apps/api/backend/routers/candela_bootstrap.py
from __future__ import annotations

from fastapi import HTTPException
from sqlmodel import Session
from sqlalchemy import text


def bootstrap_candela(
    session: Session,
    character_id: int,
    role_id: int,
    specialty_id: int,
) -> None:
    # 1) sheet 1:1
    session.exec(
        text("INSERT INTO candela_character_sheet (character_id) VALUES (:cid)"),
        params={"cid": character_id},
    )

    # 2) choice (role + specialty)
    session.exec(
        text(
            """
            INSERT INTO candela_character_choice (character_id, role_id, specialty_id)
            VALUES (:cid, :role_id, :specialty_id)
            """
        ),
        params={"cid": character_id, "role_id": role_id, "specialty_id": specialty_id},
    )

    # 3) marks (3 linhas)
    for mk in ("CORPO", "MENTE", "SANGRIA"):
        session.exec(
            text(
                """
                INSERT INTO candela_character_mark (character_id, mark_key, current, max)
                VALUES (:cid, :mk, 0, 3)
                """
            ),
            params={"cid": character_id, "mk": mk},
        )

    # 4) group_state defaults (drive_max/resist_max deixamos simples por enquanto)
    try:
        session.exec(
            text(
                """
                INSERT INTO candela_character_group_state
                  (character_id, group_key, drive_current, drive_max, resist_current, resist_max)
                SELECT :cid, d.group_key, 0, d.drive_default, 0, 3
                FROM candela_specialty_group_default d
                WHERE d.specialty_id = :sid
                """
            ),
            params={"cid": character_id, "sid": specialty_id},
        )
        inserted = session.exec(
            text("SELECT COUNT(*) FROM candela_character_group_state WHERE character_id=:cid"),
            params={"cid": character_id},
        ).one()[0]
        if inserted == 0:
            raise RuntimeError("no defaults")
    except Exception:
        for gk in ("VIGOR", "ASTUCIA", "INTUICAO"):
            session.exec(
                text(
                    """
                    INSERT INTO candela_character_group_state
                      (character_id, group_key, drive_current, drive_max, resist_current, resist_max)
                    VALUES (:cid, :gk, 0, 0, 0, 0)
                    """
                ),
                params={"cid": character_id, "gk": gk},
            )

    # 5) actions defaults + 1 gilded
    rows = session.exec(
        text(
            """
            SELECT action_key, rating, COALESCE(gilded_default, 0) AS gilded_default
            FROM candela_specialty_action_default
            WHERE specialty_id = :sid
            """
        ),
        params={"sid": specialty_id},
    ).all()

    if not rows:
        raise HTTPException(status_code=400, detail="Specialty has no action defaults")

    def group_for(action_key: str) -> str:
        if action_key in ("MOVER", "ATACAR", "CONTROLAR"):
            return "VIGOR"
        if action_key in ("INFLUENCIAR", "LER", "ESCONDER"):
            return "ASTUCIA"
        return "INTUICAO"

    gilded_set = 0
    for action_key, rating, gilded_default in rows:
        gilded = 1 if (gilded_default == 1 and gilded_set == 0) else 0
        if gilded == 1:
            gilded_set = 1
        session.exec(
            text(
                """
                INSERT INTO candela_character_action (character_id, action_key, group_key, rating, gilded)
                VALUES (:cid, :ak, :gk, :rt, :gd)
                """
            ),
            params={
                "cid": character_id,
                "ak": action_key,
                "gk": group_for(action_key),
                "rt": rating,
                "gd": gilded,
            },
        )

    if gilded_set == 0:
        first_action = rows[0][0]
        session.exec(
            text(
                """
                UPDATE candela_character_action
                SET gilded = 1
                WHERE character_id = :cid AND action_key = :ak
                """
            ),
            params={"cid": character_id, "ak": first_action},
        )
