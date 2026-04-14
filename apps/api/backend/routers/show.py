# apps/api/backend/routers/show.py
"""Show ativo (espetáculo): persistência em memória para reconexão (1 GM + até 5 jogadores).
O show só é removido quando o GM chama cancel ou o backend reinicia."""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from apps.api.backend.models.user import User, Role
from apps.api.backend.routers.auth import get_current_user

router = APIRouter(prefix="/show", tags=["show"])

# Um único show ativo por instância (em memória). Removido apenas por cancel ou restart.
_ACTIVE_SHOW: Optional[dict[str, Any]] = None


class ScenarioCrop(BaseModel):
    x: float
    y: float
    width: float
    height: float


class NarrativeSlideIn(BaseModel):
    id: str
    url: Optional[str] = None
    is_black: bool = Field(False, alias="isBlack")
    crop: Optional[ScenarioCrop] = None
    order_index: Optional[int] = Field(None, alias="order_index")

    model_config = {"populate_by_name": True}


class StorySceneSummary(BaseModel):
    id: str
    title: str
    is_narrative: bool


class ShowStartIn(BaseModel):
    """Payload para iniciar o show (compatível com o que o frontend envia em show/start)."""
    show_id: str = Field(alias="showId")
    started_at: int = Field(alias="startedAt")
    story_id: str = Field(alias="storyId")
    scene_id: str = Field(alias="sceneId")
    scenario_id: Optional[str] = Field(None, alias="scenarioId")
    scenario_image_url: Optional[str] = Field(None, alias="scenarioImageUrl")
    scenario_crop: Optional[ScenarioCrop] = Field(None, alias="scenarioCrop")
    narrative_slides: Optional[list[NarrativeSlideIn]] = Field(None, alias="narrativeSlides")
    current_narrative_index: Optional[int] = Field(None, alias="currentNarrativeIndex")
    scene_title: str = Field(alias="sceneTitle")
    scene_body: str = Field(alias="sceneBody")
    is_narrative_scene: bool = Field(alias="isNarrativeScene")
    story_scenes: list[StorySceneSummary] = Field(alias="storyScenes")

    model_config = {"populate_by_name": True}


class ShowSceneUpdateIn(BaseModel):
    """Atualiza apenas a cena atual do show ativo (troca de cena, slide narrativo, etc.)."""
    scene_id: str = Field(alias="sceneId")
    scenario_id: Optional[str] = Field(None, alias="scenarioId")
    scenario_image_url: Optional[str] = Field(None, alias="scenarioImageUrl")
    scenario_crop: Optional[ScenarioCrop] = Field(None, alias="scenarioCrop")
    narrative_slides: Optional[list[NarrativeSlideIn]] = Field(None, alias="narrativeSlides")
    current_narrative_index: Optional[int] = Field(None, alias="currentNarrativeIndex")
    scene_title: str = Field(alias="sceneTitle")
    scene_body: str = Field(alias="sceneBody")
    is_narrative_scene: bool = Field(alias="isNarrativeScene")

    model_config = {"populate_by_name": True}


class StageCharacterIn(BaseModel):
    id: int
    name: str = "Personagem"
    side: str = "PC"  # "PC" | "NPC"
    image_url: Optional[str] = Field(None, alias="imageUrl")
    x_pct: Optional[float] = Field(None, alias="xPct")
    visible: bool = True

    model_config = {"populate_by_name": True}


class ShowStageStateIn(BaseModel):
    """Estado do palco: personagens visíveis/posições e barra de dados (para reconexão do mestre)."""
    characters: list[StageCharacterIn] = Field(default_factory=list, alias="characters")
    dice_visible: bool = Field(False, alias="diceVisible")
    dice_count: int = Field(1, alias="diceCount")
    dice_golden: list[bool] = Field(default_factory=lambda: [False] * 6, alias="diceGolden")
    dice_last_result: Optional[list[int]] = Field(None, alias="diceLastResult")
    dice_show_auras: bool = Field(False, alias="diceShowAuras")
    """Slot 0–9 fixo por personagem (palco partilhado); omitir no PATCH do StageView para preservar o anterior."""
    expression_slot_by_character_id: Optional[dict[str, int]] = Field(
        None, alias="expressionSlotByCharacterId"
    )
    """Retrato fixo por personagem após fixar expressão (URL); omitir no PATCH completo para preservar."""
    portrait_url_by_character_id: Optional[dict[str, str]] = Field(
        None, alias="portraitUrlByCharacterId"
    )

    model_config = {"populate_by_name": True}


class StageExpressionPatchIn(BaseModel):
    """Merge de expressão fixa no estado do palco (após `expression/current`)."""
    expression_slot_by_character_id: dict[str, int] = Field(
        default_factory=dict, alias="expressionSlotByCharacterId"
    )
    portrait_url_by_character_id: dict[str, str] = Field(
        default_factory=dict, alias="portraitUrlByCharacterId"
    )

    model_config = {"populate_by_name": True}


def _active_show_response() -> Optional[dict[str, Any]]:
    """Retorna o show ativo no formato camelCase para o frontend."""
    if _ACTIVE_SHOW is None:
        return None
    s = _ACTIVE_SHOW
    crop = s.get("scenario_crop")
    return {
        "id": s["show_id"],
        "startedAt": s["started_at"],
        "storyId": s["story_id"],
        "sceneId": s["scene_id"],
        "scenarioId": s.get("scenario_id"),
        "scenarioImageUrl": s.get("scenario_image_url"),
        "scenarioCrop": (
            {"x": crop["x"], "y": crop["y"], "width": crop["width"], "height": crop["height"]}
            if crop and isinstance(crop, dict) else None
        ),
        "narrativeSlides": (
            [
                {
                    "id": sl["id"],
                    "url": sl.get("url"),
                    "isBlack": sl.get("is_black", False),
                    "crop": sl.get("crop"),
                    "order_index": sl.get("order_index"),
                }
                for sl in (s.get("narrative_slides") or [])
            ]
            if s.get("narrative_slides") else None
        ),
        "currentNarrativeIndex": s.get("current_narrative_index"),
        "sceneTitle": s["scene_title"],
        "sceneBody": s["scene_body"],
        "isNarrativeScene": s["is_narrative_scene"],
        "storyScenes": [
            {"id": sc["id"], "title": sc["title"], "is_narrative": sc["is_narrative"]}
            for sc in (s.get("story_scenes") or [])
        ],
        "stageState": _stage_state_for_response(s.get("stage_state")),
    }


def _stage_state_for_response(st: Optional[dict]) -> Optional[dict]:
    if not st:
        return None
    chars = st.get("characters") or []
    es_raw = st.get("expression_slot_by_character_id") or {}
    pr_raw = st.get("portrait_url_by_character_id") or {}
    expression_slot: dict[str, int] = {}
    if isinstance(es_raw, dict):
        for k, v in es_raw.items():
            if isinstance(v, (int, float)) and 0 <= int(v) <= 9:
                expression_slot[str(k)] = int(v)
    portrait_url: dict[str, str] = {}
    if isinstance(pr_raw, dict):
        for k, v in pr_raw.items():
            if isinstance(v, str) and v != "":
                portrait_url[str(k)] = v
    out: dict[str, Any] = {
        "characters": [
            {
                "id": c["id"],
                "name": c.get("name", "Personagem"),
                "side": c.get("side", "PC"),
                "imageUrl": c.get("image_url"),
                "xPct": c.get("x_pct"),
                "visible": c.get("visible", True),
            }
            for c in chars
            if isinstance(c.get("id"), (int, float))
        ],
        "diceVisible": st.get("dice_visible", False),
        "diceCount": max(1, min(6, int(st.get("dice_count", 1)))),
        "diceGolden": (
            [bool(x) for x in st["dice_golden"]][:6]
            if isinstance(st.get("dice_golden"), list) and len(st.get("dice_golden", [])) >= 6
            else [False] * 6
        ),
        "diceLastResult": (
            [int(x) for x in st["dice_last_result"] if isinstance(x, (int, float)) and 1 <= x <= 6]
            if isinstance(st.get("dice_last_result"), list)
            else None
        ),
        "diceShowAuras": bool(st.get("dice_show_auras", False)),
    }
    if expression_slot:
        out["expressionSlotByCharacterId"] = expression_slot
    if portrait_url:
        out["portraitUrlByCharacterId"] = portrait_url
    return out


@router.get("/active")
def get_show_active():
    """Retorna o show ativo atual (ou 204 se não houver). Qualquer usuário autenticado."""
    data = _active_show_response()
    if data is None:
        from fastapi.responses import Response
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return data


def _require_gm(current_user: User) -> None:
    if current_user.role != Role.GM:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas o mestre pode iniciar ou interromper o espetáculo.",
        )


@router.post("/start")
def post_show_start(
    body: ShowStartIn,
    current_user: User = Depends(get_current_user),
):
    """Registra o show ativo. Apenas GM."""
    _require_gm(current_user)
    crop = body.scenario_crop
    global _ACTIVE_SHOW
    _ACTIVE_SHOW = {
        "show_id": body.show_id,
        "started_at": body.started_at,
        "story_id": body.story_id,
        "scene_id": body.scene_id,
        "scenario_id": body.scenario_id,
        "scenario_image_url": body.scenario_image_url,
        "scenario_crop": (
            {"x": crop.x, "y": crop.y, "width": crop.width, "height": crop.height}
            if crop else None
        ),
        "narrative_slides": (
            [
                {
                    "id": sl.id,
                    "url": sl.url,
                    "is_black": sl.is_black,
                    "crop": {"x": c.x, "y": c.y, "width": c.width, "height": c.height} if (c := sl.crop) else None,
                    "order_index": sl.order_index,
                }
                for sl in body.narrative_slides
            ]
            if body.narrative_slides else None
        ),
        "current_narrative_index": body.current_narrative_index,
        "scene_title": body.scene_title,
        "scene_body": body.scene_body,
        "is_narrative_scene": body.is_narrative_scene,
        "story_scenes": [
            {"id": sc.id, "title": sc.title, "is_narrative": sc.is_narrative}
            for sc in body.story_scenes
        ],
    }
    return {"ok": True}


@router.patch("/active")
def patch_show_active(
    body: ShowSceneUpdateIn,
    current_user: User = Depends(get_current_user),
):
    """Atualiza a cena atual do show ativo (troca de cena pelo GM). Apenas GM."""
    _require_gm(current_user)
    global _ACTIVE_SHOW
    if _ACTIVE_SHOW is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhum espetáculo ativo.")
    crop = body.scenario_crop
    _ACTIVE_SHOW["scene_id"] = body.scene_id
    _ACTIVE_SHOW["scenario_id"] = body.scenario_id
    _ACTIVE_SHOW["scenario_image_url"] = body.scenario_image_url
    _ACTIVE_SHOW["scenario_crop"] = (
        {"x": crop.x, "y": crop.y, "width": crop.width, "height": crop.height} if crop else None
    )
    _ACTIVE_SHOW["narrative_slides"] = (
        [
            {
                "id": sl.id,
                "url": sl.url,
                "is_black": sl.is_black,
                "crop": {"x": c.x, "y": c.y, "width": c.width, "height": c.height} if (c := sl.crop) else None,
                "order_index": sl.order_index,
            }
            for sl in body.narrative_slides
        ]
        if body.narrative_slides else None
    )
    _ACTIVE_SHOW["current_narrative_index"] = body.current_narrative_index
    _ACTIVE_SHOW["scene_title"] = body.scene_title
    _ACTIVE_SHOW["scene_body"] = body.scene_body
    _ACTIVE_SHOW["is_narrative_scene"] = body.is_narrative_scene
    return {"ok": True}


def _merge_stage_expression(
    prev: Optional[dict],
    incoming_slots: Optional[dict[str, int]],
    incoming_portraits: Optional[dict[str, str]],
) -> tuple[dict[str, int], dict[str, str]]:
    prev_st = prev or {}
    es_prev: dict[str, int] = {}
    raw_es = prev_st.get("expression_slot_by_character_id") or {}
    if isinstance(raw_es, dict):
        for k, v in raw_es.items():
            if isinstance(v, (int, float)) and 0 <= int(v) <= 9:
                es_prev[str(k)] = int(v)
    pr_prev: dict[str, str] = {}
    raw_pr = prev_st.get("portrait_url_by_character_id") or {}
    if isinstance(raw_pr, dict):
        for k, v in raw_pr.items():
            if isinstance(v, str) and v != "":
                pr_prev[str(k)] = v
    if incoming_slots is not None:
        es_prev.update(incoming_slots)
    if incoming_portraits is not None:
        pr_prev.update(incoming_portraits)
    return es_prev, pr_prev


@router.patch("/active/stage")
def patch_show_active_stage(
    body: ShowStageStateIn,
    current_user: User = Depends(get_current_user),
):
    """Atualiza o estado do palco (personagens, dados) do show ativo. Apenas GM."""
    _require_gm(current_user)
    global _ACTIVE_SHOW
    if _ACTIVE_SHOW is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhum espetáculo ativo.")
    prev = _ACTIVE_SHOW.get("stage_state")
    es_merged, pr_merged = _merge_stage_expression(
        prev if isinstance(prev, dict) else None,
        body.expression_slot_by_character_id,
        body.portrait_url_by_character_id,
    )
    _ACTIVE_SHOW["stage_state"] = {
        "characters": [
            {
                "id": c.id,
                "name": c.name,
                "side": c.side,
                "image_url": c.image_url,
                "x_pct": c.x_pct,
                "visible": c.visible,
            }
            for c in body.characters
        ],
        "dice_visible": body.dice_visible,
        "dice_count": max(1, min(6, body.dice_count)),
        "dice_golden": [bool(x) for x in (body.dice_golden or [False] * 6)[:6]],
        "dice_last_result": (
            [int(x) for x in body.dice_last_result if 1 <= x <= 6]
            if body.dice_last_result else None
        ),
        "dice_show_auras": body.dice_show_auras,
        "expression_slot_by_character_id": es_merged,
        "portrait_url_by_character_id": pr_merged,
    }
    return {"ok": True}


@router.patch("/active/stage-expression")
def patch_show_active_stage_expression(
    body: StageExpressionPatchIn,
    current_user: User = Depends(get_current_user),
):
    """Merge de expressão fixa (slots + URLs) no estado do palco. Apenas GM."""
    _require_gm(current_user)
    global _ACTIVE_SHOW
    if _ACTIVE_SHOW is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhum espetáculo ativo.")
    prev = _ACTIVE_SHOW.get("stage_state")
    es_merged, pr_merged = _merge_stage_expression(
        prev if isinstance(prev, dict) else None,
        body.expression_slot_by_character_id,
        body.portrait_url_by_character_id,
    )
    base = prev if isinstance(prev, dict) else {}
    _ACTIVE_SHOW["stage_state"] = {
        "characters": list(base.get("characters") or []),
        "dice_visible": bool(base.get("dice_visible", False)),
        "dice_count": max(1, min(6, int(base.get("dice_count", 1)))),
        "dice_golden": (
            [bool(x) for x in base["dice_golden"]][:6]
            if isinstance(base.get("dice_golden"), list) and len(base.get("dice_golden", [])) >= 6
            else [False] * 6
        ),
        "dice_last_result": base.get("dice_last_result"),
        "dice_show_auras": bool(base.get("dice_show_auras", False)),
        "expression_slot_by_character_id": es_merged,
        "portrait_url_by_character_id": pr_merged,
    }
    return {"ok": True}


@router.post("/cancel")
def post_show_cancel(current_user: User = Depends(get_current_user)):
    """Remove o show ativo. Apenas GM."""
    _require_gm(current_user)
    global _ACTIVE_SHOW
    _ACTIVE_SHOW = None
    return {"ok": True}
