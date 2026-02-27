# Carregar .env da raiz do repositório antes de importar config (para LIVEKIT_*, AUTH_*, etc.)
from pathlib import Path
_env_path = Path(__file__).resolve().parents[2] / ".env"
if _env_path.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_env_path)
    except ImportError:
        pass

from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from apps.api.backend.config import settings
from apps.api.backend.db import init_db
from apps.api.backend.routers.livekit import router as livekit_router
from apps.api.backend.routers.lobby import router as lobby_router
from apps.api.backend.routers.auth import router as auth_router
from apps.api.backend.config import validate_settings
from apps.api.backend.routers.characters import router as characters_router, gm_router as gm_characters_router
from apps.api.backend.routers.gm_stories import router as gm_stories_router
from apps.api.backend.routers.gm_scenarios import router as gm_scenarios_router
from apps.api.backend.routers.catalog import router as catalog_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_settings()
    init_db()

    # garante diretório de uploads (evita RuntimeError do StaticFiles)
    os.makedirs("uploads", exist_ok=True)

    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_allow_origins),
    allow_credentials=True,  # necessário p/ cookie httpOnly no browser
    allow_methods=["*"],
    allow_headers=["*"],
)

# arquivos enviados ficam servidos aqui
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.include_router(livekit_router)
app.include_router(lobby_router)
app.include_router(auth_router)
app.include_router(catalog_router)
app.include_router(characters_router)
app.include_router(gm_characters_router)
app.include_router(gm_stories_router)
app.include_router(gm_scenarios_router)
