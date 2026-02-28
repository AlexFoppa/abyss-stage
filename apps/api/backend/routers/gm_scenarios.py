# apps/api/backend/routers/gm_scenarios.py
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
from apps.api.backend.models.scenario import Scenario
from apps.api.backend.routers.auth import require_gm
from apps.api.backend.models.user import User
from sqlmodel import Session, select

router = APIRouter(prefix="/gm/scenarios", tags=["gm-scenarios"])


class ScenarioOut(BaseModel):
    id: str
    name: str
    description: str
    image_storage_key: Optional[str]
    crop_x: Optional[float] = None
    crop_y: Optional[float] = None
    crop_width: Optional[float] = None
    crop_height: Optional[float] = None
    created_at: datetime
    updated_at: datetime


class ScenarioCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="")
    image_storage_key: Optional[str] = Field(default=None)
    crop_x: Optional[float] = None
    crop_y: Optional[float] = None
    crop_width: Optional[float] = None
    crop_height: Optional[float] = None


class ScenarioUpdateIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    image_storage_key: Optional[str] = None
    crop_x: Optional[float] = None
    crop_y: Optional[float] = None
    crop_width: Optional[float] = None
    crop_height: Optional[float] = None


@router.get("", response_model=list[ScenarioOut])
def list_scenarios(
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    stmt = select(Scenario).order_by(Scenario.updated_at.desc())
    rows = session.exec(stmt).all()
    return [
        ScenarioOut(
            id=s.id,
            name=s.name,
            description=s.description or "",
            image_storage_key=s.image_storage_key,
            crop_x=getattr(s, "crop_x", None),
            crop_y=getattr(s, "crop_y", None),
            crop_width=getattr(s, "crop_width", None),
            crop_height=getattr(s, "crop_height", None),
            created_at=s.created_at,
            updated_at=s.updated_at,
        )
        for s in rows
    ]


@router.post("", status_code=201, response_model=ScenarioOut)
def create_scenario(
    data: ScenarioCreateIn,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    scenario_id = str(uuid.uuid4())
    now = datetime.utcnow()
    scenario = Scenario(
        id=scenario_id,
        name=data.name.strip(),
        description=(data.description or "").strip(),
        image_storage_key=data.image_storage_key,
        crop_x=data.crop_x,
        crop_y=data.crop_y,
        crop_width=data.crop_width,
        crop_height=data.crop_height,
        created_at=now,
        updated_at=now,
    )
    try:
        session.add(scenario)
        session.commit()
    except (OperationalError, IntegrityError) as e:
        session.rollback()
        raise HTTPException(status_code=503, detail="Database error creating scenario: %s" % e)
    return ScenarioOut(
        id=scenario.id,
        name=scenario.name,
        description=scenario.description or "",
        image_storage_key=scenario.image_storage_key,
        crop_x=getattr(scenario, "crop_x", None),
        crop_y=getattr(scenario, "crop_y", None),
        crop_width=getattr(scenario, "crop_width", None),
        crop_height=getattr(scenario, "crop_height", None),
        created_at=scenario.created_at,
        updated_at=scenario.updated_at,
    )


@router.get("/{scenario_id}", response_model=ScenarioOut)
def get_scenario(
    scenario_id: str,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    scenario = session.get(Scenario, scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return ScenarioOut(
        id=scenario.id,
        name=scenario.name,
        description=scenario.description or "",
        image_storage_key=scenario.image_storage_key,
        crop_x=getattr(scenario, "crop_x", None),
        crop_y=getattr(scenario, "crop_y", None),
        crop_width=getattr(scenario, "crop_width", None),
        crop_height=getattr(scenario, "crop_height", None),
        created_at=scenario.created_at,
        updated_at=scenario.updated_at,
    )


@router.put("/{scenario_id}", response_model=ScenarioOut)
def update_scenario(
    scenario_id: str,
    data: ScenarioUpdateIn,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    scenario = session.get(Scenario, scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    if data.name is not None:
        scenario.name = data.name.strip()
    if data.description is not None:
        scenario.description = data.description
    if data.image_storage_key is not None:
        scenario.image_storage_key = data.image_storage_key
    if data.crop_x is not None:
        scenario.crop_x = data.crop_x
    if data.crop_y is not None:
        scenario.crop_y = data.crop_y
    if data.crop_width is not None:
        scenario.crop_width = data.crop_width
    if data.crop_height is not None:
        scenario.crop_height = data.crop_height
    scenario.updated_at = datetime.utcnow()
    session.add(scenario)
    session.commit()
    return ScenarioOut(
        id=scenario.id,
        name=scenario.name,
        description=scenario.description or "",
        image_storage_key=scenario.image_storage_key,
        crop_x=getattr(scenario, "crop_x", None),
        crop_y=getattr(scenario, "crop_y", None),
        crop_width=getattr(scenario, "crop_width", None),
        crop_height=getattr(scenario, "crop_height", None),
        created_at=scenario.created_at,
        updated_at=scenario.updated_at,
    )


@router.delete("/{scenario_id}", status_code=204)
def delete_scenario(
    scenario_id: str,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    scenario = session.get(Scenario, scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    session.delete(scenario)
    session.commit()
    return None


def _scenario_upload_dir(scenario_id: str) -> str:
    base = os.path.join("uploads", "scenarios", scenario_id)
    os.makedirs(base, exist_ok=True)
    return base


@router.post("/{scenario_id}/image", response_model=ScenarioOut)
def upload_scenario_image(
    scenario_id: str,
    file: UploadFile = File(...),
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    scenario = session.get(Scenario, scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")
    raw = file.file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    ext = Path(file.filename).suffix.lower() or ".jpg"
    if len(ext) > 10:
        ext = ".jpg"
    fname = f"image{ext}"
    folder = _scenario_upload_dir(scenario_id)
    abs_path = os.path.join(folder, fname)
    with open(abs_path, "wb") as f:
        f.write(raw)
    storage_key = f"scenarios/{scenario_id}/{fname}"
    scenario.image_storage_key = storage_key
    scenario.updated_at = datetime.utcnow()
    session.add(scenario)
    session.commit()
    session.refresh(scenario)
    return ScenarioOut(
        id=scenario.id,
        name=scenario.name,
        description=scenario.description or "",
        image_storage_key=scenario.image_storage_key,
        crop_x=getattr(scenario, "crop_x", None),
        crop_y=getattr(scenario, "crop_y", None),
        crop_width=getattr(scenario, "crop_width", None),
        crop_height=getattr(scenario, "crop_height", None),
        created_at=scenario.created_at,
        updated_at=scenario.updated_at,
    )
