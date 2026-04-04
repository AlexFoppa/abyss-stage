# apps/api/backend/routers/gm_stories.py
from __future__ import annotations

import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.exc import OperationalError, IntegrityError

from apps.api.backend.db import get_session
from apps.api.backend.models.story import Story
from apps.api.backend.models.scene import Scene
from apps.api.backend.models.scene_character import SceneCharacter
from apps.api.backend.models.scene_image import SceneImage
from apps.api.backend.models.story_character import StoryCharacter
from apps.api.backend.models.story_scenario import StoryScenario
from apps.api.backend.models.scenario import Scenario
from apps.api.backend.routers.auth import require_gm
from apps.api.backend.models.user import User
from sqlmodel import Session, select

router = APIRouter(prefix="/gm/stories", tags=["gm-stories"])


class StoryCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class StoryOut(BaseModel):
    id: str
    name: str
    premissa: str = ""
    o_que_aconteceu: str = ""
    temas: str = ""
    atmosfera: str = ""
    notas: str = ""
    created_at: datetime
    updated_at: datetime


class StoryUpdateIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    premissa: Optional[str] = None
    o_que_aconteceu: Optional[str] = None
    temas: Optional[str] = Field(default=None, max_length=500)
    atmosfera: Optional[str] = Field(default=None, max_length=500)
    notas: Optional[str] = None


# --- Scenes (nested under story; declare before /{story_id} so path matches) ---

class SceneOut(BaseModel):
    id: str
    story_id: str
    title: str
    body: str
    order_index: int
    is_narrative: bool
    narrative_black_start: bool
    scenario_id: Optional[str]
    created_at: datetime
    updated_at: datetime


class SceneCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(default="")
    order_index: int = Field(default=0)
    is_narrative: bool = Field(default=False)
    narrative_black_start: bool = Field(default=False)
    scenario_id: Optional[str] = Field(default=None)


class SceneUpdateIn(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    body: Optional[str] = None
    order_index: Optional[int] = None
    is_narrative: Optional[bool] = None
    narrative_black_start: Optional[bool] = None
    scenario_id: Optional[str] = None


def _scene_to_out(s: Scene) -> SceneOut:
    return SceneOut(
        id=s.id,
        story_id=s.story_id,
        title=s.title,
        body=s.body,
        order_index=s.order_index,
        is_narrative=s.is_narrative,
        narrative_black_start=getattr(s, "narrative_black_start", False),
        scenario_id=s.scenario_id,
        created_at=s.created_at,
        updated_at=s.updated_at,
    )


@router.get("/{story_id}/scenes", response_model=list[SceneOut])
def list_scenes(
    story_id: str,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    story = session.get(Story, story_id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    stmt = select(Scene).where(Scene.story_id == story_id).order_by(Scene.order_index.asc())
    rows = session.exec(stmt).all()
    return [_scene_to_out(s) for s in rows]


@router.post("/{story_id}/scenes", status_code=201, response_model=SceneOut)
def create_scene(
    story_id: str,
    data: SceneCreateIn,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    story = session.get(Story, story_id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    scene_id = str(uuid.uuid4())
    now = datetime.utcnow()
    scene = Scene(
        id=scene_id,
        story_id=story_id,
        title=data.title.strip(),
        body=data.body or "",
        order_index=data.order_index,
        is_narrative=data.is_narrative,
        narrative_black_start=data.narrative_black_start,
        scenario_id=data.scenario_id,
        created_at=now,
        updated_at=now,
    )
    try:
        session.add(scene)
        session.commit()
    except (OperationalError, IntegrityError) as e:
        session.rollback()
        raise HTTPException(status_code=503, detail=f"Database error creating scene: {e!s}")
    return _scene_to_out(scene)


@router.patch("/{story_id}/scenes/{scene_id}", response_model=SceneOut)
def update_scene(
    story_id: str,
    scene_id: str,
    data: SceneUpdateIn,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    scene = session.get(Scene, scene_id)
    if not scene or scene.story_id != story_id:
        raise HTTPException(status_code=404, detail="Scene not found")
    if data.title is not None:
        scene.title = data.title.strip()
    if data.body is not None:
        scene.body = data.body
    if data.order_index is not None:
        scene.order_index = data.order_index
    if data.is_narrative is not None:
        scene.is_narrative = data.is_narrative
    if data.narrative_black_start is not None:
        scene.narrative_black_start = data.narrative_black_start
    # Permitir limpar cenário: quando o cliente envia scenario_id (inclusive null), aplicar
    _set = getattr(data, "model_fields_set", None) or getattr(data, "__fields_set__", set())
    if "scenario_id" in _set:
        scene.scenario_id = data.scenario_id
    scene.updated_at = datetime.utcnow()
    session.add(scene)
    session.commit()
    return _scene_to_out(scene)


@router.delete("/{story_id}/scenes/{scene_id}", status_code=204)
def delete_scene(
    story_id: str,
    scene_id: str,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    scene = session.get(Scene, scene_id)
    if not scene or scene.story_id != story_id:
        raise HTTPException(status_code=404, detail="Scene not found")
    session.delete(scene)
    session.commit()
    return None


# --- Scene characters (personagens vinculados à cena, ordenados) ---

class SceneCharactersOut(BaseModel):
    character_ids: list[int]


class SceneCharactersPutIn(BaseModel):
    character_ids: list[int] = Field(default_factory=list)


@router.get("/{story_id}/scenes/{scene_id}/characters", response_model=SceneCharactersOut)
def get_scene_characters(
    story_id: str,
    scene_id: str,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    scene = session.get(Scene, scene_id)
    if not scene or scene.story_id != story_id:
        raise HTTPException(status_code=404, detail="Scene not found")
    stmt = (
        select(SceneCharacter.character_id)
        .where(SceneCharacter.scene_id == scene_id)
        .order_by(SceneCharacter.order_index.asc())
    )
    rows = session.exec(stmt).all()
    return SceneCharactersOut(character_ids=list(rows))


@router.put("/{story_id}/scenes/{scene_id}/characters", response_model=SceneCharactersOut)
def put_scene_characters(
    story_id: str,
    scene_id: str,
    data: SceneCharactersPutIn,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    scene = session.get(Scene, scene_id)
    if not scene or scene.story_id != story_id:
        raise HTTPException(status_code=404, detail="Scene not found")
    existing = session.exec(
        select(SceneCharacter).where(SceneCharacter.scene_id == scene_id)
    ).all()
    for sc in existing:
        session.delete(sc)
    for i, cid in enumerate(data.character_ids or []):
        session.add(SceneCharacter(scene_id=scene_id, character_id=cid, order_index=i))
    session.commit()
    stmt = (
        select(SceneCharacter.character_id)
        .where(SceneCharacter.scene_id == scene_id)
        .order_by(SceneCharacter.order_index.asc())
    )
    rows = session.exec(stmt).all()
    return SceneCharactersOut(character_ids=list(rows))


# --- Scene narrative images (apenas para cenas com is_narrative) ---

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


def _scene_narrative_upload_dir(story_id: str, scene_id: str) -> str:
    base = os.path.join("uploads", "scene_narrative", story_id, scene_id)
    os.makedirs(base, exist_ok=True)
    return base


class SceneImageOut(BaseModel):
    order_index: int
    storage_key: str
    url: str
    mime: Optional[str] = None
    crop_x: Optional[float] = None
    crop_y: Optional[float] = None
    crop_width: Optional[float] = None
    crop_height: Optional[float] = None


class SceneImagePatchIn(BaseModel):
    crop_x: Optional[float] = None
    crop_y: Optional[float] = None
    crop_width: Optional[float] = None
    crop_height: Optional[float] = None


class SceneImagesReorderIn(BaseModel):
    order_indexes: list[int] = Field(default_factory=list)


def _scene_image_to_out(row: SceneImage) -> SceneImageOut:
    return SceneImageOut(
        order_index=row.order_index,
        storage_key=row.storage_key,
        url=f"/uploads/{row.storage_key}",
        mime=row.mime,
        crop_x=getattr(row, "crop_x", None),
        crop_y=getattr(row, "crop_y", None),
        crop_width=getattr(row, "crop_width", None),
        crop_height=getattr(row, "crop_height", None),
    )


@router.get("/{story_id}/scenes/{scene_id}/images", response_model=list[SceneImageOut])
def list_scene_images(
    story_id: str,
    scene_id: str,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    scene = session.get(Scene, scene_id)
    if not scene or scene.story_id != story_id:
        raise HTTPException(status_code=404, detail="Scene not found")
    rows = session.exec(
        select(SceneImage).where(SceneImage.scene_id == scene_id).order_by(SceneImage.order_index.asc())
    ).all()
    return [_scene_image_to_out(row) for row in rows]


@router.post("/{story_id}/scenes/{scene_id}/images", status_code=201, response_model=SceneImageOut)
def upload_scene_image(
    story_id: str,
    scene_id: str,
    file: UploadFile = File(...),
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    scene = session.get(Scene, scene_id)
    if not scene or scene.story_id != story_id:
        raise HTTPException(status_code=404, detail="Scene not found")
    if not scene.is_narrative:
        raise HTTPException(status_code=400, detail="Scene is not narrative; images only for narrative scenes")
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")
    raw = file.file.read()
    if len(raw) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File too large")
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    ext = Path(file.filename).suffix.lower() or ".jpg"
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported image type")
    if len(ext) > 10:
        ext = ".jpg"
    existing = session.exec(
        select(SceneImage.order_index).where(SceneImage.scene_id == scene_id).order_by(SceneImage.order_index.desc())
    ).first()
    order_index = (existing + 1) if existing is not None else 0
    fname = f"image_{order_index}{ext}"
    folder = _scene_narrative_upload_dir(story_id, scene_id)
    abs_path = os.path.join(folder, fname)
    with open(abs_path, "wb") as f:
        f.write(raw)
    storage_key = f"scene_narrative/{story_id}/{scene_id}/{fname}"
    mime = file.content_type if getattr(file, "content_type", None) else None
    scene_image = SceneImage(
        scene_id=scene_id,
        order_index=order_index,
        storage_key=storage_key,
        mime=mime,
    )
    session.add(scene_image)
    session.commit()
    session.refresh(scene_image)
    return _scene_image_to_out(scene_image)


@router.patch("/{story_id}/scenes/{scene_id}/images/{order_index}", response_model=SceneImageOut)
def patch_scene_image(
    story_id: str,
    scene_id: str,
    order_index: int,
    data: SceneImagePatchIn,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    scene = session.get(Scene, scene_id)
    if not scene or scene.story_id != story_id:
        raise HTTPException(status_code=404, detail="Scene not found")
    row = session.exec(
        select(SceneImage).where(SceneImage.scene_id == scene_id, SceneImage.order_index == order_index)
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Scene image not found")
    row.crop_x = data.crop_x
    row.crop_y = data.crop_y
    row.crop_width = data.crop_width
    row.crop_height = data.crop_height
    session.add(row)
    session.commit()
    session.refresh(row)
    return _scene_image_to_out(row)


@router.put("/{story_id}/scenes/{scene_id}/images/order", response_model=list[SceneImageOut])
def reorder_scene_images(
    story_id: str,
    scene_id: str,
    data: SceneImagesReorderIn,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    scene = session.get(Scene, scene_id)
    if not scene or scene.story_id != story_id:
        raise HTTPException(status_code=404, detail="Scene not found")
    rows = session.exec(
        select(SceneImage).where(SceneImage.scene_id == scene_id).order_by(SceneImage.order_index.asc())
    ).all()
    existing_by_index = {row.order_index: row for row in rows}
    existing_indexes = sorted(existing_by_index.keys())
    requested_indexes = list(data.order_indexes or [])
    if sorted(requested_indexes) != existing_indexes:
        raise HTTPException(status_code=400, detail="Invalid image order")

    for row in rows:
        session.delete(row)
    session.flush()

    reordered_rows: list[SceneImage] = []
    for new_index, old_index in enumerate(requested_indexes):
        row = existing_by_index[old_index]
        new_row = SceneImage(
            scene_id=scene_id,
            order_index=new_index,
            storage_key=row.storage_key,
            mime=row.mime,
            crop_x=row.crop_x,
            crop_y=row.crop_y,
            crop_width=row.crop_width,
            crop_height=row.crop_height,
            created_at=row.created_at,
        )
        session.add(new_row)
        reordered_rows.append(new_row)
    session.commit()
    for row in reordered_rows:
        session.refresh(row)
    return [_scene_image_to_out(row) for row in reordered_rows]


@router.delete("/{story_id}/scenes/{scene_id}/images/{order_index}", status_code=204)
def delete_scene_image(
    story_id: str,
    scene_id: str,
    order_index: int,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    scene = session.get(Scene, scene_id)
    if not scene or scene.story_id != story_id:
        raise HTTPException(status_code=404, detail="Scene not found")
    row = session.exec(
        select(SceneImage).where(SceneImage.scene_id == scene_id, SceneImage.order_index == order_index)
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Scene image not found")
    abs_path = os.path.join("uploads", row.storage_key)
    if os.path.isfile(abs_path):
        try:
            os.remove(abs_path)
        except OSError:
            pass
    session.delete(row)
    session.flush()
    remaining = session.exec(
        select(SceneImage).where(SceneImage.scene_id == scene_id).order_by(SceneImage.order_index.asc())
    ).all()
    if remaining:
        old_indexes = [item.order_index for item in remaining]
        existing_by_index = {item.order_index: item for item in remaining}
        for item in remaining:
            session.delete(item)
        session.flush()
        for new_index, old_index in enumerate(old_indexes):
            item = existing_by_index[old_index]
            session.add(
                SceneImage(
                    scene_id=scene_id,
                    order_index=new_index,
                    storage_key=item.storage_key,
                    mime=item.mime,
                    crop_x=item.crop_x,
                    crop_y=item.crop_y,
                    crop_width=item.crop_width,
                    crop_height=item.crop_height,
                    created_at=item.created_at,
                )
            )
    session.commit()
    return None


# --- Story characters (elenco da história: quem faz parte da história) ---

class StoryCharactersOut(BaseModel):
    character_ids: list[int]


class StoryCharactersPutIn(BaseModel):
    character_ids: list[int] = Field(default_factory=list)


@router.get("/{story_id}/characters", response_model=StoryCharactersOut)
def get_story_characters(
    story_id: str,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    story = session.get(Story, story_id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    stmt = select(StoryCharacter.character_id).where(StoryCharacter.story_id == story_id)
    rows = session.exec(stmt).all()
    return StoryCharactersOut(character_ids=list(rows))


@router.put("/{story_id}/characters", response_model=StoryCharactersOut)
def put_story_characters(
    story_id: str,
    data: StoryCharactersPutIn,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    story = session.get(Story, story_id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    existing = session.exec(select(StoryCharacter).where(StoryCharacter.story_id == story_id)).all()
    for sc in existing:
        session.delete(sc)
    for cid in data.character_ids or []:
        session.add(StoryCharacter(story_id=story_id, character_id=cid))
    session.commit()
    stmt = select(StoryCharacter.character_id).where(StoryCharacter.story_id == story_id)
    rows = session.exec(stmt).all()
    return StoryCharactersOut(character_ids=list(rows))


# --- Story scenarios (pool do editor: IDs extras além dos usados em cenas) ---

class StoryScenariosOut(BaseModel):
    scenario_ids: list[str]


class StoryScenariosPutIn(BaseModel):
    scenario_ids: list[str] = Field(default_factory=list)


@router.get("/{story_id}/scenarios", response_model=StoryScenariosOut)
def get_story_scenarios(
    story_id: str,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    story = session.get(Story, story_id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    stmt = select(StoryScenario.scenario_id).where(StoryScenario.story_id == story_id)
    rows = session.exec(stmt).all()
    return StoryScenariosOut(scenario_ids=list(rows))


@router.put("/{story_id}/scenarios", response_model=StoryScenariosOut)
def put_story_scenarios(
    story_id: str,
    data: StoryScenariosPutIn,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    story = session.get(Story, story_id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    seen: set[str] = set()
    ordered_unique: list[str] = []
    for sid in data.scenario_ids or []:
        if sid in seen:
            continue
        seen.add(sid)
        ordered_unique.append(sid)
    for sid in ordered_unique:
        if not session.get(Scenario, sid):
            raise HTTPException(status_code=400, detail=f"Unknown scenario_id: {sid}")
    existing = session.exec(select(StoryScenario).where(StoryScenario.story_id == story_id)).all()
    for row in existing:
        session.delete(row)
    for sid in ordered_unique:
        session.add(StoryScenario(story_id=story_id, scenario_id=sid))
    session.commit()
    stmt = select(StoryScenario.scenario_id).where(StoryScenario.story_id == story_id)
    rows = session.exec(stmt).all()
    return StoryScenariosOut(scenario_ids=list(rows))


@router.get("", response_model=list[StoryOut])
def list_stories(
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    stmt = select(Story).order_by(Story.updated_at.desc())
    rows = session.exec(stmt).all()
    return [_story_to_out(s) for s in rows]


@router.post("", status_code=201, response_model=StoryOut)
def create_story(
    data: StoryCreateIn,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    story_id = str(uuid.uuid4())
    now = datetime.utcnow()
    story = Story(
        id=story_id,
        name=data.name.strip(),
        premissa="",
        o_que_aconteceu="",
        temas="",
        atmosfera="",
        notas="",
        created_at=now,
        updated_at=now,
    )
    try:
        session.add(story)
        session.commit()
    except (OperationalError, IntegrityError) as e:
        session.rollback()
        raise HTTPException(
            status_code=503,
            detail=f"Database error creating story. If you just added the Story feature, restart the API server so the story table is created: {e!s}",
        )
    return _story_to_out(story)


def _story_to_out(s: Story) -> StoryOut:
    return StoryOut(
        id=s.id,
        name=s.name,
        premissa=getattr(s, "premissa", "") or "",
        o_que_aconteceu=getattr(s, "o_que_aconteceu", "") or "",
        temas=getattr(s, "temas", "") or "",
        atmosfera=getattr(s, "atmosfera", "") or "",
        notas=getattr(s, "notas", "") or "",
        created_at=s.created_at,
        updated_at=s.updated_at,
    )


@router.get("/{story_id}", response_model=StoryOut)
def get_story(
    story_id: str,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    story = session.get(Story, story_id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    return _story_to_out(story)


@router.put("/{story_id}", response_model=StoryOut)
def update_story(
    story_id: str,
    data: StoryUpdateIn,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    story = session.get(Story, story_id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    if data.name is not None:
        story.name = data.name.strip()
    if data.premissa is not None:
        story.premissa = data.premissa
    if data.o_que_aconteceu is not None:
        story.o_que_aconteceu = data.o_que_aconteceu
    if data.temas is not None:
        story.temas = data.temas[:500]
    if data.atmosfera is not None:
        story.atmosfera = data.atmosfera[:500]
    if data.notas is not None:
        story.notas = data.notas
    story.updated_at = datetime.utcnow()
    session.add(story)
    session.commit()
    return _story_to_out(story)


@router.delete("/{story_id}", status_code=204)
def delete_story(
    story_id: str,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    story = session.get(Story, story_id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    session.delete(story)
    session.commit()
    return None
