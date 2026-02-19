# apps/api/backend/routers/gm_stories.py
from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from apps.api.backend.db import get_session
from apps.api.backend.models.story import Story
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
    session.add(story)
    session.commit()
    session.refresh(story)
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
    session.refresh(story)
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
