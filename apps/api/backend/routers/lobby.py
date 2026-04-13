# apps/api/backend/routers/lobby.py
"""Presença no lobby: quem está na tela e com qual personagem (até 1 mestre + 6 jogadores).
Presença real vem do LiveKit (quem está na sala); metadados (personagem) vêm do store."""
from __future__ import annotations

import time
from typing import Any, Optional, Set

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session
from sqlalchemy import text

from apps.api.backend.config import settings
from apps.api.backend.db import get_session
from apps.api.backend.models.user import User, Role
from apps.api.backend.routers.auth import get_current_user

router = APIRouter(prefix="/lobby", tags=["lobby"])

# Metadados por user_id (personagem, etc.). Presença real = quem está na sala LiveKit.
_LOBBY_STORE: dict[int, dict[str, Any]] = {}
# Fallback: TTL para limpar store quando não usamos LiveKit ou API falha.
_LOBBY_TTL = 90


class LobbyMeIn(BaseModel):
    character_id: Optional[int] = None
    expression_slot: Optional[int] = None  # 0-9, default 0 (Padrão)


class LobbyParticipantOut(BaseModel):
    user_id: int
    identity: str
    is_gm: bool
    character_id: Optional[int]
    character_name: Optional[str]
    character_image_url: Optional[str]
    expression_slot: Optional[int] = None  # slot de expressão em exibição (0-9)
    """Mapa slot (0-9) → URL da imagem, para exibir override/current em qualquer slot."""
    character_image_by_slot: Optional[dict[int, str]] = None
    user_email: Optional[str] = None
    user_name: Optional[str] = None


class LobbyOut(BaseModel):
    participants: list[LobbyParticipantOut]


def _get_character_name_for_lobby(
    session: Session, character_id: int, user_id: int
) -> Optional[str]:
    """Retorna o nome do personagem se existir e for do usuário (PC)."""
    row = session.exec(
        text(
            """
            SELECT c.name
            FROM character c
            WHERE c.id = :cid AND c.kind = 'PC' AND c.owner_user_id = :uid
            """
        ),
        params={"cid": character_id, "uid": user_id},
    ).first()
    return str(row[0] or "") if row else None


def _get_character_name_for_gm(session: Session, character_id: int) -> Optional[str]:
    """Nome do personagem por id (mestre: PC ou NPC na base)."""
    row = session.exec(
        text("SELECT name FROM character WHERE id = :cid"),
        params={"cid": character_id},
    ).first()
    return str(row[0] or "").strip() if row and row[0] is not None else None


def _get_character_image_url_for_slot(
    session: Session, character_id: int, slot: int
) -> Optional[str]:
    """Retorna a URL da imagem do personagem no slot dado (0-9). Fallback para slot 0 se não houver imagem."""
    for try_slot in (slot, 0):
        img_row = session.exec(
            text(
                """
                SELECT storage_key, created_at
                FROM character_image
                WHERE character_id = :cid AND slot = :s
                LIMIT 1
                """
            ),
            params={"cid": character_id, "s": try_slot},
        ).first()
        if img_row and img_row[0]:
            base = f"/api/uploads/{str(img_row[0]).lstrip('/')}"
            rev = str(img_row[1]) if img_row[1] else None
            return f"{base}?rev={rev}" if rev else base
    return None


def _get_character_image_urls_by_slot(
    session: Session, character_id: int
) -> dict[int, str]:
    """Retorna um mapa slot (0-9) → URL para todas as imagens do personagem (apenas slots com imagem)."""
    rows = session.exec(
        text(
            """
            SELECT slot, storage_key, created_at
            FROM character_image
            WHERE character_id = :cid
            ORDER BY slot ASC
            """
        ),
        params={"cid": character_id},
    ).all()
    result: dict[int, str] = {}
    for r in rows:
        if not r or r[1] is None:
            continue
        slot = int(r[0])
        base = f"/api/uploads/{str(r[1]).lstrip('/')}"
        rev = str(r[2]) if r[2] else None
        result[slot] = f"{base}?rev={rev}" if rev else base
    return result


@router.post("/me")
def lobby_me(
    body: LobbyMeIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Registra minha presença no lobby, opcionalmente com o personagem selecionado e slot de expressão."""
    identity = "gm" if current_user.role == Role.GM else f"player-{current_user.id}"
    is_gm = current_user.role == Role.GM
    character_id: Optional[int] = body.character_id
    character_name: Optional[str] = None
    character_image_url: Optional[str] = None

    # expression_slot: 0-9, default 0. Se enviado, validar; senão manter atual ou 0.
    expression_slot = 0
    if body.expression_slot is not None:
        if not (0 <= body.expression_slot <= 9):
            raise HTTPException(
                status_code=400,
                detail="expression_slot deve ser um inteiro entre 0 e 9.",
            )
        expression_slot = body.expression_slot
    else:
        existing = _LOBBY_STORE.get(current_user.id)
        if existing and existing.get("character_id") == character_id:
            expression_slot = existing.get("expression_slot", 0)
        # ao trocar de personagem ou entrar sem dados prévios, fica 0

    if not is_gm and character_id is not None:
        character_name = _get_character_name_for_lobby(session, character_id, current_user.id)
        if character_name is None:
            raise HTTPException(status_code=404, detail="Personagem não encontrado ou não é seu.")
        character_image_url = _get_character_image_url_for_slot(session, character_id, expression_slot)
    elif is_gm and character_id is not None:
        gm_char_name = _get_character_name_for_gm(session, character_id)
        if gm_char_name is None:
            raise HTTPException(status_code=404, detail="Personagem não encontrado.")
        character_name = gm_char_name
        character_image_url = _get_character_image_url_for_slot(session, character_id, expression_slot)
    elif character_id is None:
        expression_slot = 0  # sem personagem: slot não se aplica ao mestre/jogador sem PC

    display_name = (getattr(current_user, "name", None) or "").strip() or (getattr(current_user, "email", None) or "")
    now = time.time()
    _LOBBY_STORE[current_user.id] = {
        "user_id": current_user.id,
        "identity": identity,
        "is_gm": is_gm,
        "character_id": character_id,
        "character_name": character_name,
        "character_image_url": character_image_url,
        "expression_slot": expression_slot,
        "user_email": getattr(current_user, "email", None) or None,
        "user_name": display_name or None,
        "updated_at": now,
    }
    return {}


@router.delete("/me")
def lobby_me_delete(current_user: User = Depends(get_current_user)):
    """Remove minha presença do lobby (chamado ao deslogar)."""
    _LOBBY_STORE.pop(current_user.id, None)
    return {}


async def _livekit_identities_in_room(room: str = "lobby") -> Optional[Set[str]]:
    """Retorna set de identities atualmente na sala LiveKit, ou None se API falhar."""
    try:
        from livekit.api import LiveKitAPI
        from livekit.protocol.room import ListParticipantsRequest

        url = (settings.livekit_api_url or "").strip()
        key = (settings.livekit_api_key or "").strip()
        secret = (settings.livekit_api_secret or "").strip()
        if not url or not key or not secret:
            return None
        async with LiveKitAPI(url=url, api_key=key, api_secret=secret) as lk:
            req = ListParticipantsRequest(room=room)
            res = await lk.room.list_participants(req)
            return {p.identity for p in (res.participants or [])}
    except Exception:
        return None


def _participant_image_by_slot(
    session: Session, character_id: Optional[int]
) -> Optional[dict[int, str]]:
    if character_id is None:
        return None
    urls = _get_character_image_urls_by_slot(session, character_id)
    return urls if urls else None


@router.get("", response_model=LobbyOut)
async def get_lobby(session: Session = Depends(get_session)):
    """Lista quem está no lobby. Presença = quem está na sala LiveKit; metadados (personagem) do store.
    Se a API LiveKit não estiver disponível, usa só o store com TTL (fallback)."""
    now = time.time()
    live_identities: Optional[Set[str]] = await _livekit_identities_in_room("lobby")

    if live_identities is not None:
        # Só mostrar quem está de fato na sala LiveKit; enriquecer com store.
        participants = []
        for identity in live_identities:
            is_gm = identity == "gm"
            user_id = 0
            character_id: Optional[int] = None
            character_name: Optional[str] = None
            character_image_url: Optional[str] = None
            expression_slot: Optional[int] = None
            user_email: Optional[str] = None
            user_name: Optional[str] = None
            for data in _LOBBY_STORE.values():
                if data.get("identity") == identity:
                    user_id = data["user_id"]
                    character_id = data.get("character_id")
                    character_name = data.get("character_name")
                    character_image_url = data.get("character_image_url")
                    expression_slot = data.get("expression_slot")
                    user_email = data.get("user_email")
                    user_name = data.get("user_name")
                    break
            if not is_gm and identity.startswith("player-"):
                try:
                    user_id = int(identity.split("-", 1)[1])
                except (ValueError, IndexError):
                    pass
            character_image_by_slot = _participant_image_by_slot(session, character_id)
            participants.append(
                LobbyParticipantOut(
                    user_id=user_id,
                    identity=identity,
                    is_gm=is_gm,
                    character_id=character_id,
                    character_name=character_name,
                    character_image_url=character_image_url,
                    expression_slot=expression_slot,
                    character_image_by_slot=character_image_by_slot,
                    user_email=user_email,
                    user_name=user_name,
                )
            )
        # Ordenar: gm primeiro, depois por identity
        participants.sort(key=lambda p: (0 if p.is_gm else 1, p.identity))
        return LobbyOut(participants=participants)

    # Fallback: sem LiveKit, usar store + TTL
    to_remove = [
        uid for uid, data in _LOBBY_STORE.items()
        if (now - data.get("updated_at", 0)) > _LOBBY_TTL
    ]
    for uid in to_remove:
        _LOBBY_STORE.pop(uid, None)
    participants = [
        LobbyParticipantOut(
            user_id=data["user_id"],
            identity=data["identity"],
            is_gm=data["is_gm"],
            character_id=data.get("character_id"),
            character_name=data.get("character_name"),
            character_image_url=data.get("character_image_url"),
            expression_slot=data.get("expression_slot"),
            character_image_by_slot=_participant_image_by_slot(session, data.get("character_id")),
            user_email=data.get("user_email"),
            user_name=data.get("user_name"),
        )
        for data in _LOBBY_STORE.values()
    ]
    return LobbyOut(participants=participants)
