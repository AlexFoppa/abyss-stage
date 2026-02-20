# apps/api/backend/routers/gm_scenarios.py
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
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
    created_at: datetime
    updated_at: datetime


class ScenarioCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="")
    image_storage_key: Optional[str] = Field(default=None)


class ScenarioUpdateIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    image_storage_key: Optional[str] = None


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
    scenario.updated_at = datetime.utcnow()
    session.add(scenario)
    session.commit()
    return ScenarioOut(
        id=scenario.id,
        name=scenario.name,
        description=scenario.description or "",
        image_storage_key=scenario.image_storage_key,
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
