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


class LobbyParticipantOut(BaseModel):
    user_id: int
    identity: str
    is_gm: bool
    character_id: Optional[int]
    character_name: Optional[str]
    character_image_url: Optional[str]
    user_email: Optional[str] = None
    user_name: Optional[str] = None


class LobbyOut(BaseModel):
    participants: list[LobbyParticipantOut]


def _get_character_for_lobby(
    session: Session, character_id: int, user_id: int
) -> Optional[tuple[str, Optional[str], Optional[str]]]:
    """Retorna (name, image_url, image_rev) se o personagem existir e for do usuário."""
    row = session.exec(
        text(
            """
            SELECT c.id, c.name
            FROM character c
            WHERE c.id = :cid AND c.kind = 'PC' AND c.owner_user_id = :uid
            """
        ),
        params={"cid": character_id, "uid": user_id},
    ).first()
    if not row:
        return None
    name = str(row[1] or "")
    img_row = session.exec(
        text(
            """
            SELECT storage_key, created_at
            FROM character_image
            WHERE character_id = :cid AND slot = 0
            LIMIT 1
            """
        ),
        params={"cid": character_id},
    ).first()
    if not img_row or not img_row[0]:
        return (name, None, None)
    return (name, f"/api/uploads/{str(img_row[0]).lstrip('/')}", str(img_row[1]) if img_row[1] else None)


@router.post("/me")
def lobby_me(
    body: LobbyMeIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Registra minha presença no lobby, opcionalmente com o personagem selecionado."""
    identity = "gm" if current_user.role == Role.GM else f"player-{current_user.id}"
    is_gm = current_user.role == Role.GM
    character_id: Optional[int] = body.character_id
    character_name: Optional[str] = None
    character_image_url: Optional[str] = None
    character_image_rev: Optional[str] = None

    if not is_gm and character_id is not None:
        info = _get_character_for_lobby(session, character_id, current_user.id)
        if not info:
            raise HTTPException(status_code=404, detail="Personagem não encontrado ou não é seu.")
        character_name, img_url, img_rev = info
        if img_url and img_rev:
            character_image_url = f"{img_url}?rev={img_rev}"
        else:
            character_image_url = img_url

    display_name = (getattr(current_user, "name", None) or "").strip() or (getattr(current_user, "email", None) or "")
    now = time.time()
    _LOBBY_STORE[current_user.id] = {
        "user_id": current_user.id,
        "identity": identity,
        "is_gm": is_gm,
        "character_id": character_id,
        "character_name": character_name,
        "character_image_url": character_image_url,
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


@router.get("", response_model=LobbyOut)
async def get_lobby():
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
            user_email: Optional[str] = None
            user_name: Optional[str] = None
            for data in _LOBBY_STORE.values():
                if data.get("identity") == identity:
                    user_id = data["user_id"]
                    character_id = data.get("character_id")
                    character_name = data.get("character_name")
                    character_image_url = data.get("character_image_url")
                    user_email = data.get("user_email")
                    user_name = data.get("user_name")
                    break
            if not is_gm and identity.startswith("player-"):
                try:
                    user_id = int(identity.split("-", 1)[1])
                except (ValueError, IndexError):
                    pass
            participants.append(
                LobbyParticipantOut(
                    user_id=user_id,
                    identity=identity,
                    is_gm=is_gm,
                    character_id=character_id,
                    character_name=character_name,
                    character_image_url=character_image_url,
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
            user_email=data.get("user_email"),
            user_name=data.get("user_name"),
        )
        for data in _LOBBY_STORE.values()
    ]
    return LobbyOut(participants=participants)
