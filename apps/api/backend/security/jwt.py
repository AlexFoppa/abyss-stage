from __future__ import annotations

from jose import jwt
from typing import Any


def encode_hs256(payload: dict[str, Any], secret: str) -> str:
    return jwt.encode(payload, secret, algorithm="HS256")


def decode_hs256(token: str, secret: str) -> dict[str, Any]:
    return jwt.decode(token, secret, algorithms=["HS256"])


def make_access_token(*, sub: str, secret: str, issuer: str, ttl_seconds: int, extra: dict[str, Any] | None = None) -> str:
    import time
    now = int(time.time())
    payload: dict[str, Any] = {
        "iss": issuer,
        "sub": sub,
        "iat": now,
        "nbf": now,
        "exp": now + int(ttl_seconds),
    }
    if extra:
        payload.update(extra)
    return encode_hs256(payload, secret)
