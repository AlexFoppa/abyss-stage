"""Log de cada pedido HTTP (método, path, status, duração) para estudar polling e limites.

Activar: ABYSS_HTTP_LOG=1 (ou true/yes). Não loga corpo nem cabeçalhos (cookies, secrets).
"""
from __future__ import annotations

import logging
import os
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("abyss.http")


def http_request_logging_enabled() -> bool:
    v = (os.getenv("ABYSS_HTTP_LOG") or "").strip().lower()
    return v in ("1", "true", "yes", "on")


class HttpRequestLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "%s %s -> %s %.1fms",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
        )
        return response
