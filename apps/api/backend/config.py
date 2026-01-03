import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    # Web
    cors_allow_origins: tuple[str, ...] = ("http://localhost:5173",)

    # LiveKit (temporário; depois vira env)
    livekit_api_key: str = os.getenv("LIVEKIT_API_KEY", "")
    livekit_api_secret: str = os.getenv("LIVEKIT_API_SECRET", "")

    # Auth (vamos usar já já)
    auth_jwt_secret: str = os.getenv("AUTH_JWT_SECRET", "")    
    auth_jwt_issuer: str = os.getenv("AUTH_JWT_ISSUER", "abyss-stage")
    auth_jwt_ttl_seconds: int = int(os.getenv("AUTH_JWT_TTL_SECONDS", "3600"))
    auth_cookie_name: str = os.getenv("AUTH_COOKIE_NAME", "abyss_session")


settings = Settings()

def validate_settings() -> None:
    missing = []
    if not settings.livekit_api_key:
        missing.append("LIVEKIT_API_KEY")
    if not settings.livekit_api_secret:
        missing.append("LIVEKIT_API_SECRET")
    if not settings.auth_jwt_secret:
        missing.append("AUTH_JWT_SECRET")
    if missing:
        raise RuntimeError("Missing env vars: " + ", ".join(missing))
