from fastapi import APIRouter, Depends
import time

from apps.api.backend.config import settings
from apps.api.backend.security.jwt import encode_hs256
from apps.api.backend.routers.auth import get_current_user
from apps.api.backend.models.user import User

router = APIRouter()

@router.get("/token")
def token(room: str, current_user: User = Depends(get_current_user)):
    payload = {
        "iss": settings.livekit_api_key,
        "sub": str(current_user.id),  # ou current_user.email, se preferir
        "nbf": int(time.time()),
        "exp": int(time.time()) + 3600,
        "video": {
            "roomJoin": True,
            "room": room,
        },
    }
    return {"token": encode_hs256(payload, settings.livekit_api_secret)}
