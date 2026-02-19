# apps/api/backend/routers/gm_stories.py
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import OperationalError, IntegrityError

from apps.api.backend.db import get_session
from apps.api.backend.models.story import Story
from apps.api.backend.models.scene import Scene
from apps.api.backend.routers.auth import require_gm
from apps.api.backend.models.user import User
from sqlmodel import Session, select

router = APIRouter(prefix="/gm/stories", tags=["gm-stories"])


class StoryCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class StoryOut(BaseModel):
    id: str
    name: str
    created_at: datetime
    updated_at: datetime


class StoryUpdateIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)


# --- Scenes (nested under story; declare before /{story_id} so path matches) ---

class SceneOut(BaseModel):
    id: str
    story_id: str
    title: str
    body: str
    order_index: int
    is_narrative: bool
    scenario_id: Optional[str]
    created_at: datetime
    updated_at: datetime


class SceneCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(default="")
    order_index: int = Field(default=0)
    is_narrative: bool = Field(default=False)
    scenario_id: Optional[str] = Field(default=None)


class SceneUpdateIn(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    body: Optional[str] = None
    order_index: Optional[int] = None
    is_narrative: Optional[bool] = None
    scenario_id: Optional[str] = None


def _scene_to_out(s: Scene) -> SceneOut:
    return SceneOut(
        id=s.id,
        story_id=s.story_id,
        title=s.title,
        body=s.body,
        order_index=s.order_index,
        is_narrative=s.is_narrative,
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
    if data.scenario_id is not None:
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


@router.get("", response_model=list[StoryOut])
def list_stories(
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    stmt = select(Story).order_by(Story.updated_at.desc())
    rows = session.exec(stmt).all()
    return [StoryOut(id=s.id, name=s.name, created_at=s.created_at, updated_at=s.updated_at) for s in rows]


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
    return StoryOut(id=story.id, name=story.name, created_at=story.created_at, updated_at=story.updated_at)


@router.get("/{story_id}", response_model=StoryOut)
def get_story(
    story_id: str,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    story = session.get(Story, story_id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    return StoryOut(id=story.id, name=story.name, created_at=story.created_at, updated_at=story.updated_at)


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
    story.name = data.name.strip()
    story.updated_at = datetime.utcnow()
    session.add(story)
    session.commit()
    return StoryOut(id=story.id, name=story.name, created_at=story.created_at, updated_at=story.updated_at)


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
