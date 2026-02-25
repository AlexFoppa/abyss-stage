import time
from datetime import timedelta

import jwt
from fastapi import APIRouter, Depends, HTTPException
from livekit.api import AccessToken, VideoGrants

from apps.api.backend.config import settings
from apps.api.backend.routers.auth import get_current_user
from apps.api.backend.models.user import User, Role

router = APIRouter()

# nbf no passado fixo: se o relógio da API estiver à frente do LiveKit (ex.: API em 2026, LiveKit em 2025),
# o token seria rejeitado como "not yet valid". Usar nbf=1 garante que o token é aceito pelo servidor.
NBF_ALWAYS_VALID = 1


def _normalize(s: str) -> str:
    """Remove espaços e \\r que podem vir do .env ou cola."""
    return (s or "").strip().replace("\r", "")


@router.get("/token")
def token(room: str, current_user: User = Depends(get_current_user)):
    identity = "gm" if current_user.role == Role.GM else f"player-{current_user.id}"
    api_key = _normalize(settings.livekit_api_key or "")
    api_secret = _normalize(settings.livekit_api_secret or "")
    if not api_key or not api_secret:
        raise HTTPException(
            status_code=500,
            detail="LIVEKIT_API_KEY e LIVEKIT_API_SECRET devem estar definidos (ex.: no .env).",
        )
    at = AccessToken(api_key=api_key, api_secret=api_secret)
    at.with_identity(identity)
    at.with_grants(VideoGrants(room_join=True, room=room))
    at.with_ttl(timedelta(hours=1))
    jwt_str = at.to_jwt()
    # Ajustar nbf para o passado, para o LiveKit aceitar mesmo com relógio da API à frente (ex.: API em 2026, LiveKit em 2025)
    try:
        payload = jwt.decode(jwt_str, options={"verify_signature": False})
        payload["nbf"] = NBF_ALWAYS_VALID
        payload["exp"] = int(time.time()) + 3600
        jwt_str = jwt.encode(payload, api_secret, algorithm="HS256")
    except Exception:
        pass
    url = _normalize(settings.livekit_ws_url or "") or "ws://127.0.0.1:7880"
    key_preview = f"{api_key[:4]}...{api_key[-2:]}" if len(api_key) >= 6 else "???"
    return {
        "token": jwt_str,
        "url": url,
        "key_preview": key_preview,
    }
