import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  rectIntersection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../api";
import { scenarioCropFromScenario, scenarioImageUrl as getScenarioImageUrl } from "../scenarioCrop";
import { ScenarioManagerModal, type Scenario } from "./ScenarioManagerModal";
import { SceneCharactersModal, type GMCharacter } from "./SceneCharactersModal";
import { ScenarioBackground, SceneStagePreview } from "./SceneStagePreview";
import { ScenarioCropEditor } from "./ScenarioCropEditor";
import { EditCharacterScreen } from "./EditCharacterScreen";
import type { Character } from "../types/character";
import { getAvatarUrl } from "../utils/avatar";

/** Prefixos para IDs no DnD (evita colisão entre cenário, cena, personagem, reordenação). */
const SCENARIO_DRAG_PREFIX = "scenario-";
const SCENE_DROP_PREFIX = "scene-drop-";
const SCENE_CHAR_DROP_PREFIX = "scene-char-drop-";
const CHAR_DRAG_PREFIX = "char-";
const SCENE_REORDER_PREFIX = "scene-reorder-";
const NARRATIVE_IMAGE_REORDER_PREFIX = "narrative-image-reorder-";

function gmCharacterKind(c: GMCharacter): "PC" | "NPC" {
  return c.kind === "NPC" ? "NPC" : "PC";
}

/** Converte GMCharacter (campos opcionais) para Character (campos obrigatórios) para EditCharacterScreen. */
function gmCharToCharacter(c: GMCharacter | null): Character | null {
  if (!c) return null;
  return {
    id: c.id,
    name: c.name,
    concept: c.concept ?? "",
    system: c.system ?? "simplificado",
    backstory: c.backstory ?? "",
    notes: c.notes ?? "",
    systems: c.systems,
    default_image_url: c.default_image_url,
    default_image_rev: c.default_image_rev,
  };
}

function scenarioImageUrl(scenario: Scenario): string | null {
  return getScenarioImageUrl(scenario);
}

function DraggableScenarioThumb({ scenario }: { scenario: Scenario }) {
  const id = SCENARIO_DRAG_PREFIX + scenario.id;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  const imgUrl = scenarioImageUrl(scenario);
  return (
    <span
      ref={setNodeRef}
      className={"story-editor__scenario-thumb story-editor__scenario-thumb--polaroid" + (isDragging ? " story-editor__scenario-thumb--dragging" : "")}
      title={(scenario.description || scenario.name) + "\n\nArraste até a cena para associar."}
      {...listeners}
      {...attributes}
    >
      <span className="story-editor__scenario-thumb-img-wrap">
        {imgUrl ? (
          <img src={imgUrl} alt="" className="story-editor__scenario-thumb-img" />
        ) : (
          <span className="story-editor__scenario-thumb-placeholder">Sem imagem</span>
        )}
      </span>
      <span className="story-editor__scenario-thumb-name">{scenario.name || "(sem nome)"}</span>
    </span>
  );
}

function SceneScenarioDropZone({
  sceneId,
  currentScenarioId,
  scenarioName,
  children,
}: {
  sceneId: string;
  currentScenarioId: string | null;
  scenarioName: string | null;
  children: React.ReactNode;
}) {
  const id = SCENE_DROP_PREFIX + sceneId;
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={"story-editor__scene-drop" + (isOver ? " story-editor__scene-drop--over" : "")}
    >
      {currentScenarioId && scenarioName ? (
        <p className="story-editor__scene-scenario-label">
          Cenário: <strong>{scenarioName}</strong> (arraste outro para trocar)
        </p>
      ) : (
        <p className="story-editor__scene-drop-hint">Arraste um cenário aqui para associar à cena.</p>
      )}
      {children}
    </div>
  );
}

function SceneCharacterDropZone({
  sceneId,
  children,
}: {
  sceneId: string;
  children: React.ReactNode;
}) {
  const id = SCENE_CHAR_DROP_PREFIX + sceneId;
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={"story-editor__scene-char-drop" + (isOver ? " story-editor__scene-char-drop--over" : "")}
    >
      {children}
    </div>
  );
}

function DraggableCharacterThumb({ character }: { character: GMCharacter }) {
  const id = CHAR_DRAG_PREFIX + character.id;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  const kind = gmCharacterKind(character);
  return (
    <div
      ref={setNodeRef}
      className={"story-editor__char-thumb" + (isDragging ? " story-editor__char-thumb--dragging" : "")}
      title="Arraste até a cena para adicionar à cena."
      {...listeners}
      {...attributes}
    >
      <img src={getAvatarUrl(character ?? undefined)} alt="" className="story-editor__char-thumb-avatar" />
      <span className="story-editor__char-thumb-text">
        <span className="story-editor__char-thumb-name">{character.name}</span>
        <span className={"story-editor__char-kind-badge" + (kind === "NPC" ? " story-editor__char-kind-badge--npc" : "")}>
          {kind}
        </span>
      </span>
    </div>
  );
}

function SortableSceneItem({
  scene,
  isActive,
  onSelect,
  onOpenDetails,
}: {
  scene: Scene;
  isActive: boolean;
  onSelect: () => void;
  onOpenDetails: (e: React.MouseEvent) => void;
}) {
  const id = SCENE_REORDER_PREFIX + scene.id;
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id });
  return (
    <li
      ref={setDropRef}
      className={
        "story-editor__scene-item-wrap" +
        (isActive ? " story-editor__scene-item-wrap--active" : "") +
        (isDragging ? " story-editor__scene-item-wrap--dragging" : "") +
        (isOver ? " story-editor__scene-item-wrap--over" : "")
      }
    >
      <span
        ref={setDragRef}
        className="story-editor__scene-item-handle"
        title="Arraste para reordenar"
        {...listeners}
        {...attributes}
      >
        ≡
      </span>
      <button
        type="button"
        className={"story-editor__scene-item " + (isActive ? "story-editor__scene-item--active" : "")}
        onClick={onSelect}
      >
        {scene.title || "(sem título)"}
      </button>
      <button
        type="button"
        className="story-editor__scene-item-duplicate"
        onClick={onOpenDetails}
        title="Detalhes e duplicar"
        aria-label="Detalhes e duplicar"
      >
        ⧉
      </button>
    </li>
  );
}

function SortableNarrativeImageItem({
  image,
  isActive,
  onSelect,
  onRemove,
}: {
  image: SceneImageItem;
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const id = NARRATIVE_IMAGE_REORDER_PREFIX + image.order_index;
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id });
  return (
    <li
      ref={setDropRef}
      className={
        "story-editor__narrative-images-item" +
        (isActive ? " story-editor__narrative-images-item--active" : "") +
        (isDragging ? " story-editor__narrative-images-item--dragging" : "") +
        (isOver ? " story-editor__narrative-images-item--over" : "")
      }
    >
      <button
        type="button"
        className="story-editor__narrative-images-handle"
        ref={setDragRef}
        title="Arraste para reordenar"
        aria-label="Arraste para reordenar"
        {...listeners}
        {...attributes}
      >
        ≡
      </button>
      <button type="button" className="story-editor__narrative-images-main" onClick={onSelect}>
        <span className="story-editor__narrative-images-thumb-wrap">
          <img src={image.url} alt="" className="story-editor__narrative-images-thumb" />
        </span>
        <span className="story-editor__narrative-images-order">{image.order_index + 1}</span>
      </button>
      <button
        type="button"
        className="ui-btn ui-btn--ghost story-editor__narrative-images-remove"
        onClick={onRemove}
        aria-label="Remover imagem"
      >
        Remover
      </button>
    </li>
  );
}

export type StoryInfo = {
  id: string;
  name: string;
  premissa?: string;
  o_que_aconteceu?: string;
  temas?: string;
  atmosfera?: string;
  notas?: string;
  created_at: string;
  updated_at: string;
};

const TOOLTIP_WIDTH = 360;
const TOOLTIP_GAP = 8;

function placeTooltipBeside(rect: DOMRect): { left: number; top: number } {
  const w = window.innerWidth;
  const h = window.innerHeight;
  let left: number;
  if (rect.right + TOOLTIP_GAP + TOOLTIP_WIDTH <= w) {
    left = rect.right + TOOLTIP_GAP;
  } else if (rect.left - TOOLTIP_GAP - TOOLTIP_WIDTH >= 0) {
    left = rect.left - TOOLTIP_WIDTH - TOOLTIP_GAP;
  } else {
    left = Math.max(TOOLTIP_GAP, w - TOOLTIP_WIDTH - TOOLTIP_GAP);
  }
  const top = Math.min(rect.top, h - 400 - 16);
  return { left, top: Math.max(TOOLTIP_GAP, top) };
}

export type Scene = {
  id: string;
  story_id: string;
  title: string;
  body: string;
  order_index: number;
  is_narrative: boolean;
  narrative_black_start: boolean;
  scenario_id: string | null;
  created_at: string;
  updated_at: string;
};

type SceneImageItem = {
  order_index: number;
  storage_key: string;
  url: string;
  mime?: string | null;
  crop_x?: number | null;
  crop_y?: number | null;
  crop_width?: number | null;
  crop_height?: number | null;
};

type NarrativeSlide = {
  id: string;
  url: string | null;
  isBlack: boolean;
  crop: { x: number; y: number; width: number; height: number } | null;
  order_index: number | null;
};

function ScenePreview({
  isNormalScene,
  scenario,
  sceneCharacterIds,
  gmCharacters,
  gmEmail,
  narrativeSlide,
  narrativeEditable = false,
  onNarrativeCropChange,
}: {
  isNormalScene: boolean;
  scenario: Scenario | null;
  sceneCharacterIds: number[];
  gmCharacters: GMCharacter[];
  gmEmail?: string;
  narrativeSlide?: NarrativeSlide | null;
  narrativeEditable?: boolean;
  onNarrativeCropChange?: (crop: { x: number; y: number; width: number; height: number }) => void;
}) {
  const scenarioBg = getScenarioImageUrl(scenario);

  if (!isNormalScene) {
    return (
      <div className="story-editor__preview">
        <h2 className="story-editor__preview-title">Preview</h2>
        <div className="story-editor__preview-stage story-editor__preview-stage--narrative">
          {narrativeSlide?.isBlack ? (
            <div className="story-editor__preview-black" />
          ) : narrativeSlide?.url && narrativeEditable && onNarrativeCropChange ? (
            <div className="story-editor__preview-crop-inline">
              <ScenarioCropEditor
                imageUrl={narrativeSlide.url}
                crop={narrativeSlide.crop}
                onChange={onNarrativeCropChange}
                showHint={false}
              />
            </div>
          ) : narrativeSlide?.url ? (
            <ScenarioBackground
              imageUrl={narrativeSlide.url}
              crop={narrativeSlide.crop ?? undefined}
              className="story-editor__preview-narrative-bg"
            />
          ) : (
            <p className="story-editor__placeholder">Cena narrativa — sem preview.</p>
          )}
        </div>
      </div>
    );
  }

  const scenarioCrop = scenarioCropFromScenario(scenario);

  return (
    <div className="story-editor__preview">
      <h2 className="story-editor__preview-title">Preview da cena</h2>
      <SceneStagePreview
        scenarioImageUrl={scenarioBg}
        scenarioCrop={scenarioCrop}
        sceneCharacterIds={sceneCharacterIds}
        gmCharacters={gmCharacters}
        gmEmail={gmEmail}
        variant="preview"
      />
    </div>
  );
}

export function StoryEditorScreen({
  storyId,
  initialSceneId = null,
  onBack,
  onNavigateToCreateCharacter,
  onNavigateToCreateScenario,
}: {
  storyId: string;
  /** Cena a selecionar ao abrir (ex.: vindo do Espetáculo "Editar"). */
  initialSceneId?: string | null;
  onBack: () => void;
  /** Fecha modais e navega para criação de personagem (telas padrão); ao voltar, retorna ao editor. */
  onNavigateToCreateCharacter?: () => void;
  /** Fecha modais e navega para cenários (criar novo); ao voltar, retorna ao editor. */
  onNavigateToCreateScenario?: () => void;
}) {
  const { user } = useAuth();
  const [story, setStory] = useState<StoryInfo | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const initialSceneIdAppliedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenarioModalOpen, setScenarioModalOpen] = useState(false);
  const [sceneSaving, setSceneSaving] = useState(false);
  const [gmCharacters, setGmCharacters] = useState<GMCharacter[]>([]);
  const [storyCharacterIds, setStoryCharacterIds] = useState<number[]>([]);
  const [sceneCharacterIds, setSceneCharacterIds] = useState<number[]>([]);
  const [characterModalOpen, setCharacterModalOpen] = useState(false);
  const [editingCharacterId, setEditingCharacterId] = useState<number | null>(null);
  const [sceneDetailsSceneId, setSceneDetailsSceneId] = useState<string | null>(null);
  const [sceneDetailsCharacterIds, setSceneDetailsCharacterIds] = useState<number[]>([]);
  const [duplicating, setDuplicating] = useState(false);
  /** Filtro do painel direito (cenas regulares): personagens da história por PC / NPC. */
  const [storyCharKindFilter, setStoryCharKindFilter] = useState<"all" | "PC" | "NPC">("all");
  const [autosaveEnabled, setAutosaveEnabled] = useState(true);
  const [storyTooltipPos, setStoryTooltipPos] = useState<{ left: number; top: number } | null>(null);
  const storyTooltipLeaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastSavedState, setLastSavedState] = useState<{
    sceneId: string;
    title: string;
    body: string;
    is_narrative: boolean;
    narrative_black_start: boolean;
  } | null>(null);
  const [narrativeSceneImages, setNarrativeSceneImages] = useState<SceneImageItem[]>([]);
  const [narrativeImagesLoading, setNarrativeImagesLoading] = useState(false);
  const [narrativeImageUploading, setNarrativeImageUploading] = useState(false);
  const [narrativePreviewIndex, setNarrativePreviewIndex] = useState(0);
  const [narrativeDropActive, setNarrativeDropActive] = useState(false);
  const narrativeImageInputRef = useRef<HTMLInputElement | null>(null);
  const narrativeCropSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeScene = scenes.find((s) => s.id === activeSceneId) ?? null;
  const sceneDetailsScene = sceneDetailsSceneId ? scenes.find((s) => s.id === sceneDetailsSceneId) ?? null : null;
  const narrativeSlides: NarrativeSlide[] = [
    ...(activeScene?.is_narrative && activeScene.narrative_black_start
      ? [{ id: "black-start", url: null, isBlack: true, crop: null, order_index: null }]
      : []),
    ...narrativeSceneImages.map((img) => ({
      id: `image-${img.order_index}`,
      url: img.url,
      isBlack: false,
      crop:
        Number.isFinite(Number(img.crop_x)) &&
        Number.isFinite(Number(img.crop_y)) &&
        Number.isFinite(Number(img.crop_width)) &&
        Number.isFinite(Number(img.crop_height)) &&
        Number(img.crop_width) > 0 &&
        Number(img.crop_height) > 0
          ? {
              x: Number(img.crop_x),
              y: Number(img.crop_y),
              width: Number(img.crop_width),
              height: Number(img.crop_height),
            }
          : null,
      order_index: img.order_index,
    })),
  ];
  const currentNarrativeSlide =
    narrativeSlides[Math.max(0, Math.min(narrativePreviewIndex, Math.max(0, narrativeSlides.length - 1)))] ?? null;

  const filteredStoryPanelChars = useMemo(() => {
    return storyCharacterIds
      .map((id) => gmCharacters.find((c) => c.id === id))
      .filter((c): c is GMCharacter => Boolean(c))
      .filter((c) => storyCharKindFilter === "all" || gmCharacterKind(c) === storyCharKindFilter);
  }, [storyCharacterIds, gmCharacters, storyCharKindFilter]);

  /** IDs de cenários na história: usados em cenas ou adicionados à história (sem cena ainda). */
  const [addedToStoryScenarioIds, setAddedToStoryScenarioIds] = useState<string[]>([]);
  const scenarioIdsInStory = new Set([
    ...scenes.map((s) => s.scenario_id).filter(Boolean),
    ...addedToStoryScenarioIds,
  ]);
  const scenariosInStory = scenarios.filter((sc) => scenarioIdsInStory.has(sc.id));

  const isDirty = Boolean(
    activeScene &&
    activeSceneId &&
    lastSavedState?.sceneId === activeSceneId &&
    (lastSavedState.title !== (activeScene.title ?? "") ||
      lastSavedState.body !== (activeScene.body ?? "") ||
      lastSavedState.is_narrative !== activeScene.is_narrative ||
      lastSavedState.narrative_black_start !== activeScene.narrative_black_start)
  );

  const sceneSnapshotRef = useRef<{ sceneId: string; title: string; body: string; is_narrative: boolean; narrative_black_start: boolean } | null>(null);
  const activeSceneIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeSceneIdRef.current = activeSceneId;
  }, [activeSceneId]);
  useEffect(() => {
    if (activeSceneId && activeScene) {
      sceneSnapshotRef.current = {
        sceneId: activeSceneId,
        title: activeScene.title ?? "",
        body: activeScene.body ?? "",
        is_narrative: activeScene.is_narrative,
        narrative_black_start: activeScene.narrative_black_start,
      };
    }
  }, [activeSceneId, activeScene?.title, activeScene?.body, activeScene?.is_narrative, activeScene?.narrative_black_start]);

  const loadScenarios = useCallback(async () => {
    try {
      const list = await api<Scenario[]>("/api/gm/scenarios");
      setScenarios(Array.isArray(list) ? list : []);
    } catch {
      setScenarios([]);
    }
  }, []);

  const loadGmCharacters = useCallback(async () => {
    try {
      const list = await api<GMCharacter[]>("/api/gm/characters");
      setGmCharacters(Array.isArray(list) ? list : []);
    } catch {
      setGmCharacters([]);
    }
  }, []);

  const loadStoryCharacters = useCallback(async () => {
    try {
      const res = await api<{ character_ids: number[] }>(
        `/api/gm/stories/${storyId}/characters`
      );
      setStoryCharacterIds(res?.character_ids ?? []);
    } catch {
      setStoryCharacterIds([]);
    }
  }, [storyId]);

  const loadSceneCharacters = useCallback(
    async (sceneId: string) => {
      try {
        const res = await api<{ character_ids: number[] }>(
          `/api/gm/stories/${storyId}/scenes/${sceneId}/characters`
        );
        setSceneCharacterIds(res?.character_ids ?? []);
      } catch {
        setSceneCharacterIds([]);
      }
    },
    [storyId]
  );

  const loadNarrativeSceneImages = useCallback(
    async (sceneId: string) => {
      setNarrativeImagesLoading(true);
      try {
        const list = await api<SceneImageItem[]>(
          `/api/gm/stories/${storyId}/scenes/${sceneId}/images`
        );
        setNarrativeSceneImages(Array.isArray(list) ? list : []);
      } catch {
        setNarrativeSceneImages([]);
      } finally {
        setNarrativeImagesLoading(false);
      }
    },
    [storyId]
  );

  const loadStory = useCallback(async () => {
    try {
      const s = await api<StoryInfo>(`/api/gm/stories/${storyId}`);
      setStory(s);
    } catch (e: unknown) {
      const msg =
        e && typeof (e as { message?: string })?.message === "string"
          ? (e as { message: string }).message
          : "Falha ao carregar história";
      setErr(msg);
    }
  }, [storyId]);

  const loadScenes = useCallback(async () => {
    try {
      const list = await api<Scene[]>(`/api/gm/stories/${storyId}/scenes`);
      const ordered = Array.isArray(list) ? [...list].sort((a, b) => a.order_index - b.order_index) : [];
      setScenes(ordered);
      if (ordered.length > 0) {
        setActiveSceneId((prev) => (ordered.some((s) => s.id === prev) ? prev : ordered[0].id));
      } else {
        setActiveSceneId(null);
      }
    } catch (e: unknown) {
      const msg =
        e && typeof (e as { message?: string })?.message === "string"
          ? (e as { message: string }).message
          : "Falha ao carregar cenas";
      setErr(msg);
    }
  }, [storyId]);

  useEffect(() => {
    setAddedToStoryScenarioIds([]);
    initialSceneIdAppliedRef.current = false;
  }, [storyId]);

  useEffect(() => {
    let cancelled = false;
    setErr(null);
    setLoading(true);
    (async () => {
      await loadStory();
      if (cancelled) return;
      await loadScenes();
      if (cancelled) return;
      await loadScenarios();
      if (cancelled) return;
      await loadGmCharacters();
      if (cancelled) return;
      await loadStoryCharacters();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [storyId, loadStory, loadScenes, loadScenarios, loadGmCharacters, loadStoryCharacters]);

  useEffect(() => {
    if (initialSceneIdAppliedRef.current || !initialSceneId || scenes.length === 0) return;
    if (scenes.some((s) => s.id === initialSceneId)) {
      setActiveSceneId(initialSceneId);
      initialSceneIdAppliedRef.current = true;
    }
  }, [initialSceneId, scenes]);

  const addScenarioToStory = useCallback((scenarioId: string) => {
    setAddedToStoryScenarioIds((prev) => (prev.includes(scenarioId) ? prev : [...prev, scenarioId]));
  }, []);

  const removeScenarioFromStory = useCallback(
    async (scenarioId: string) => {
      const toUpdate = scenes.filter((s) => s.scenario_id === scenarioId);
      for (const scene of toUpdate) {
        await api(`/api/gm/stories/${storyId}/scenes/${scene.id}`, {
          method: "PATCH",
          body: JSON.stringify({ scenario_id: null }),
        });
      }
      await loadScenes();
      setAddedToStoryScenarioIds((prev) => prev.filter((id) => id !== scenarioId));
    },
    [storyId, scenes, loadScenes]
  );

  useEffect(() => {
    if (activeSceneId && activeScene && !activeScene.is_narrative) {
      loadSceneCharacters(activeSceneId);
    } else {
      setSceneCharacterIds([]);
    }
  }, [activeSceneId, activeScene?.id, activeScene?.is_narrative, loadSceneCharacters]);

  useEffect(() => {
    if (activeSceneId && activeScene?.is_narrative) {
      loadNarrativeSceneImages(activeSceneId);
    } else {
      setNarrativeSceneImages([]);
    }
  }, [activeSceneId, activeScene?.is_narrative, loadNarrativeSceneImages]);

  useEffect(() => {
    setNarrativePreviewIndex((prev) => {
      if (narrativeSlides.length === 0) return 0;
      return Math.max(0, Math.min(prev, narrativeSlides.length - 1));
    });
  }, [activeSceneId, activeScene?.narrative_black_start, narrativeSceneImages.length]);

  useEffect(() => {
    if (activeSceneId && activeScene) {
      setLastSavedState({
        sceneId: activeSceneId,
        title: activeScene.title ?? "",
        body: activeScene.body ?? "",
        is_narrative: activeScene.is_narrative,
        narrative_black_start: activeScene.narrative_black_start,
      });
    }
  }, [activeSceneId]);

  useEffect(() => {
    if (!autosaveEnabled || !isDirty) return;
    const t = setTimeout(() => {
      const snap = sceneSnapshotRef.current;
      if (!snap || snap.sceneId !== activeSceneIdRef.current) return;
      handleUpdateScene({
        title: snap.title,
        body: snap.body,
        is_narrative: snap.is_narrative,
        narrative_black_start: snap.narrative_black_start,
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [autosaveEnabled, isDirty, activeScene?.title, activeScene?.body, activeScene?.is_narrative, activeScene?.narrative_black_start, activeSceneId]);

  useEffect(() => {
    if (!sceneDetailsSceneId) {
      setSceneDetailsCharacterIds([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ character_ids: number[] }>(
          `/api/gm/stories/${storyId}/scenes/${sceneDetailsSceneId}/characters`
        );
        if (!cancelled) setSceneDetailsCharacterIds(res?.character_ids ?? []);
      } catch {
        if (!cancelled) setSceneDetailsCharacterIds([]);
      }
    })();
    return () => { cancelled = true; };
  }, [storyId, sceneDetailsSceneId]);

  useEffect(() => {
    if (!sceneDetailsSceneId) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSceneDetailsSceneId(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sceneDetailsSceneId]);

  useEffect(() => {
    return () => {
      if (narrativeCropSaveTimeoutRef.current) clearTimeout(narrativeCropSaveTimeoutRef.current);
    };
  }, []);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 8 } })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const overId = String(over.id);
    const activeId = String(active.id);

    const isOverSceneArea =
      overId.startsWith(SCENE_CHAR_DROP_PREFIX) || overId.startsWith(SCENE_DROP_PREFIX);
    const sceneIdFromOver = overId.startsWith(SCENE_CHAR_DROP_PREFIX)
      ? overId.slice(SCENE_CHAR_DROP_PREFIX.length)
      : overId.slice(SCENE_DROP_PREFIX.length);

    if (isOverSceneArea && activeId.startsWith(CHAR_DRAG_PREFIX)) {
      const characterId = parseInt(activeId.slice(CHAR_DRAG_PREFIX.length), 10);
      if (Number.isNaN(characterId)) return;
      if (!activeSceneId || sceneIdFromOver !== activeSceneId) return;
      const scene = scenes.find((s) => s.id === sceneIdFromOver);
      if (scene?.is_narrative) return;
      if (sceneCharacterIds.includes(characterId)) return;
      setErr(null);
      try {
        const next = [...sceneCharacterIds, characterId];
        await api(`/api/gm/stories/${storyId}/scenes/${sceneIdFromOver}/characters`, {
          method: "PUT",
          body: JSON.stringify({ character_ids: next }),
        });
        setSceneCharacterIds(next);
      } catch (e: unknown) {
        const msg =
          e && typeof (e as { message?: string })?.message === "string"
            ? (e as { message: string }).message
            : "Falha ao adicionar personagem à cena";
        setErr(msg);
      }
      return;
    }

    if (isOverSceneArea && activeId.startsWith(SCENARIO_DRAG_PREFIX)) {
      const scenarioId = activeId.slice(SCENARIO_DRAG_PREFIX.length);
      if (!activeSceneId || sceneIdFromOver !== activeSceneId) return;
      const scene = scenes.find((s) => s.id === sceneIdFromOver);
      if (scene?.is_narrative) return;
      const scenario = scenarios.find((sc) => sc.id === scenarioId);
      const activeSceneCurrent = scenes.find((s) => s.id === sceneIdFromOver);
      const currentBody = activeSceneCurrent?.body?.trim() ?? "";
      const scenarioDesc = scenario?.description?.trim() ?? "";
      setErr(null);
      try {
        const payload: { scenario_id: string; body?: string } = { scenario_id: scenarioId };
        if (scenarioDesc && !currentBody) payload.body = scenarioDesc;
        const updated = await api<Scene>(`/api/gm/stories/${storyId}/scenes/${sceneIdFromOver}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setScenes((prev) =>
          prev.map((s) =>
            s.id === sceneIdFromOver
              ? {
                  ...s,
                  ...updated,
                  // Garantir que o body pré-preenchido pelo cenário fique no estado
                  ...(payload.body !== undefined ? { body: payload.body } : {}),
                }
              : s
          )
        );
      } catch (e: unknown) {
        const msg =
          e && typeof (e as { message?: string })?.message === "string"
            ? (e as { message: string }).message
            : "Falha ao associar cenário";
        setErr(msg);
      }
    }

    if (activeId.startsWith(SCENE_REORDER_PREFIX) && overId.startsWith(SCENE_REORDER_PREFIX)) {
      const fromId = activeId.slice(SCENE_REORDER_PREFIX.length);
      const toId = overId.slice(SCENE_REORDER_PREFIX.length);
      if (fromId === toId) return;
      const fromIndex = scenes.findIndex((s) => s.id === fromId);
      const toIndex = scenes.findIndex((s) => s.id === toId);
      if (fromIndex === -1 || toIndex === -1) return;
      const newOrder = [...scenes];
      const [removed] = newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, removed);
      setErr(null);
      try {
        await Promise.all(
          newOrder.map((s, index) =>
            api<Scene>(`/api/gm/stories/${storyId}/scenes/${s.id}`, {
              method: "PATCH",
              body: JSON.stringify({ order_index: index }),
            })
          )
        );
        setScenes(newOrder);
      } catch (e: unknown) {
        const msg =
          e && typeof (e as { message?: string })?.message === "string"
            ? (e as { message: string }).message
            : "Falha ao reordenar cenas";
        setErr(msg);
      }
    }

    if (
      activeId.startsWith(NARRATIVE_IMAGE_REORDER_PREFIX) &&
      overId.startsWith(NARRATIVE_IMAGE_REORDER_PREFIX) &&
      activeSceneId
    ) {
      const fromOrderIndex = parseInt(activeId.slice(NARRATIVE_IMAGE_REORDER_PREFIX.length), 10);
      const toOrderIndex = parseInt(overId.slice(NARRATIVE_IMAGE_REORDER_PREFIX.length), 10);
      if (Number.isNaN(fromOrderIndex) || Number.isNaN(toOrderIndex) || fromOrderIndex === toOrderIndex) return;
      const fromIndex = narrativeSceneImages.findIndex((img) => img.order_index === fromOrderIndex);
      const toIndex = narrativeSceneImages.findIndex((img) => img.order_index === toOrderIndex);
      if (fromIndex === -1 || toIndex === -1) return;
      const reordered = [...narrativeSceneImages];
      const [removed] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, removed);
      setErr(null);
      try {
        const updated = await api<SceneImageItem[]>(
          `/api/gm/stories/${storyId}/scenes/${activeSceneId}/images/order`,
          {
            method: "PUT",
            body: JSON.stringify({ order_indexes: reordered.map((img) => img.order_index) }),
          }
        );
        setNarrativeSceneImages(Array.isArray(updated) ? updated : []);
      } catch (e: unknown) {
        const msg =
          e && typeof (e as { message?: string })?.message === "string"
            ? (e as { message: string }).message
            : "Falha ao reordenar imagens";
        setErr(msg);
      }
    }
  }

  async function handleUpdateScene(patch: {
    title?: string;
    body?: string;
    is_narrative?: boolean;
    narrative_black_start?: boolean;
  }): Promise<boolean> {
    if (!activeSceneId || !activeScene) return false;
    setErr(null);
    setSceneSaving(true);
    try {
      const updated = await api<Scene>(`/api/gm/stories/${storyId}/scenes/${activeSceneId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setScenes((prev) =>
        prev.map((s) => (s.id === activeSceneId ? { ...s, ...updated } : s))
      );
      setLastSavedState({
        sceneId: activeSceneId,
        title: updated.title ?? "",
        body: updated.body ?? "",
        is_narrative: updated.is_narrative,
        narrative_black_start: updated.narrative_black_start,
      });
      return true;
    } catch (e: unknown) {
      const msg =
        e && typeof (e as { message?: string })?.message === "string"
          ? (e as { message: string }).message
          : "Falha ao salvar cena";
      setErr(msg);
      return false;
    } finally {
      setSceneSaving(false);
    }
  }

  function handleSaveSceneClick() {
    if (!activeScene) return;
    handleUpdateScene({
      title: activeScene.title.trim() || activeScene.title,
      body: activeScene.body ?? "",
      is_narrative: activeScene.is_narrative,
      narrative_black_start: activeScene.narrative_black_start,
    });
  }

  async function trySwitchScene(nextSceneId: string) {
    if (nextSceneId === activeSceneId) return;
    if (autosaveEnabled && activeScene) {
      const ok = await handleUpdateScene({
        title: activeScene.title ?? "",
        body: activeScene.body ?? "",
        is_narrative: activeScene.is_narrative,
        narrative_black_start: activeScene.narrative_black_start,
      });
      if (ok) setActiveSceneId(nextSceneId);
    } else if (!autosaveEnabled && isDirty) {
      if (!window.confirm("Há alterações não salvas. Trocar de cena sem salvar?")) return;
      setActiveSceneId(nextSceneId);
    } else {
      setActiveSceneId(nextSceneId);
    }
  }

  async function handleBack() {
    if (autosaveEnabled && activeScene) {
      const ok = await handleUpdateScene({
        title: activeScene.title ?? "",
        body: activeScene.body ?? "",
        is_narrative: activeScene.is_narrative,
        narrative_black_start: activeScene.narrative_black_start,
      });
      if (ok) onBack();
    } else if (!autosaveEnabled && isDirty) {
      if (!window.confirm("Há alterações não salvas. Sair do editor sem salvar?")) return;
      onBack();
    } else {
      onBack();
    }
  }

  async function removeCharacterFromScene(characterId: number) {
    if (!activeSceneId) return;
    setErr(null);
    try {
      const next = sceneCharacterIds.filter((id) => id !== characterId);
      await api(`/api/gm/stories/${storyId}/scenes/${activeSceneId}/characters`, {
        method: "PUT",
        body: JSON.stringify({ character_ids: next }),
      });
      setSceneCharacterIds(next);
    } catch (e: unknown) {
      const msg =
        e && typeof (e as { message?: string })?.message === "string"
          ? (e as { message: string }).message
          : "Falha ao remover";
      setErr(msg);
    }
  }

  async function handleNarrativeImageUpload(files: FileList | null) {
    if (!activeSceneId || !activeScene?.is_narrative || !files?.length) return;
    setErr(null);
    setNarrativeImageUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) {
          setErr("Apenas imagens são permitidas.");
          break;
        }
        const form = new FormData();
        form.append("file", file);
        await api(`/api/gm/stories/${storyId}/scenes/${activeSceneId}/images`, {
          method: "POST",
          body: form,
        });
      }
      if (activeSceneId) await loadNarrativeSceneImages(activeSceneId);
    } catch (e: unknown) {
      const msg =
        e && typeof (e as { message?: string })?.message === "string"
          ? (e as { message: string }).message
          : "Falha ao enviar imagem";
      setErr(msg);
    } finally {
      setNarrativeImageUploading(false);
      if (narrativeImageInputRef.current) narrativeImageInputRef.current.value = "";
    }
  }

  function handleNarrativeFileDrop(e: React.DragEvent<HTMLButtonElement | HTMLDivElement>) {
    e.preventDefault();
    setNarrativeDropActive(false);
    if (e.dataTransfer?.files?.length) {
      handleNarrativeImageUpload(e.dataTransfer.files);
    }
  }

  async function removeNarrativeImage(orderIndex: number) {
    if (!activeSceneId) return;
    setErr(null);
    try {
      await api(
        `/api/gm/stories/${storyId}/scenes/${activeSceneId}/images/${orderIndex}`,
        { method: "DELETE" }
      );
      await loadNarrativeSceneImages(activeSceneId);
    } catch (e: unknown) {
      const msg =
        e && typeof (e as { message?: string })?.message === "string"
          ? (e as { message: string }).message
          : "Falha ao remover imagem";
      setErr(msg);
    }
  }

  async function toggleNarrativeBlackStart(enabled: boolean) {
    if (!activeSceneId || !activeScene) return;
    setScenes((prev) =>
      prev.map((scene) =>
        scene.id === activeSceneId ? { ...scene, narrative_black_start: enabled } : scene
      )
    );
    const ok = await handleUpdateScene({
      is_narrative: activeScene.is_narrative,
      narrative_black_start: enabled,
    });
    if (!ok) {
      setScenes((prev) =>
        prev.map((scene) =>
          scene.id === activeSceneId ? { ...scene, narrative_black_start: !enabled } : scene
        )
      );
    } else if (enabled) {
      setNarrativePreviewIndex(0);
    }
  }

  function updateNarrativeImageCrop(orderIndex: number, crop: { x: number; y: number; width: number; height: number }) {
    setNarrativeSceneImages((prev) =>
      prev.map((img) =>
        img.order_index === orderIndex
          ? {
              ...img,
              crop_x: crop.x,
              crop_y: crop.y,
              crop_width: crop.width,
              crop_height: crop.height,
            }
          : img
      )
    );
    if (narrativeCropSaveTimeoutRef.current) clearTimeout(narrativeCropSaveTimeoutRef.current);
    narrativeCropSaveTimeoutRef.current = setTimeout(async () => {
      if (!activeSceneId) return;
      try {
        await api<SceneImageItem>(
          `/api/gm/stories/${storyId}/scenes/${activeSceneId}/images/${orderIndex}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              crop_x: crop.x,
              crop_y: crop.y,
              crop_width: crop.width,
              crop_height: crop.height,
            }),
          }
        );
      } catch (e: unknown) {
        const msg =
          e && typeof (e as { message?: string })?.message === "string"
            ? (e as { message: string }).message
            : "Falha ao salvar enquadramento da imagem";
        setErr(msg);
      }
    }, 250);
  }

  async function handleCreateScene() {
    const title = window.prompt("Título da nova cena:", "Nova cena");
    if (title == null || !title.trim()) return;
    setErr(null);
    setCreating(true);
    try {
      const created = await api<Scene>(`/api/gm/stories/${storyId}/scenes`, {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          body: "",
          order_index: scenes.length,
          is_narrative: false,
        narrative_black_start: false,
          scenario_id: null,
        }),
      });
      setScenes((prev) => [...prev, created].sort((a, b) => a.order_index - b.order_index));
      setActiveSceneId(created.id);
    } catch (e: unknown) {
      const msg =
        e && typeof (e as { message?: string })?.message === "string"
          ? (e as { message: string }).message
          : "Falha ao criar cena";
      setErr(msg);
    } finally {
      setCreating(false);
    }
  }

  async function handleDuplicateScene() {
    if (!sceneDetailsScene) return;
    setErr(null);
    setDuplicating(true);
    try {
      const created = await api<Scene>(`/api/gm/stories/${storyId}/scenes`, {
        method: "POST",
        body: JSON.stringify({
          title: "Cópia de " + (sceneDetailsScene.title?.trim() || "Cena"),
          body: sceneDetailsScene.body ?? "",
          order_index: scenes.length,
          is_narrative: sceneDetailsScene.is_narrative,
          narrative_black_start: sceneDetailsScene.narrative_black_start,
          scenario_id: sceneDetailsScene.scenario_id,
        }),
      });
      if (sceneDetailsCharacterIds.length > 0) {
        await api(`/api/gm/stories/${storyId}/scenes/${created.id}/characters`, {
          method: "PUT",
          body: JSON.stringify({ character_ids: sceneDetailsCharacterIds }),
        });
      }
      await loadScenes();
      setActiveSceneId(created.id);
      setSceneDetailsSceneId(null);
    } catch (e: unknown) {
      const msg =
        e && typeof (e as { message?: string })?.message === "string"
          ? (e as { message: string }).message
          : "Falha ao duplicar cena";
      setErr(msg);
    } finally {
      setDuplicating(false);
    }
  }

  if (loading && !story) {
    return (
      <div className="story-editor">
        <div className="story-editor__header">
          <button type="button" className="ui-btn ui-btn--ghost" onClick={onBack}>
            Voltar
          </button>
          <span className="story-editor__title">Carregando…</span>
        </div>
        <div className="story-editor__grid" />
      </div>
    );
  }

  if (err && !story) {
    return (
      <div className="story-editor">
        <div className="story-editor__header">
          <button type="button" className="ui-btn ui-btn--ghost" onClick={onBack}>
            Voltar
          </button>
          <span className="story-editor__title">Erro</span>
        </div>
        <p className="story-editor__error">{err}</p>
      </div>
    );
  }

  return (
    <div className="story-editor">
      <div className="story-editor__header">
        <button type="button" className="ui-btn ui-btn--ghost" onClick={handleBack}>
          Voltar
        </button>
        <div className="story-editor__title-row">
          <h1 className="story-editor__title">{story?.name ?? storyId}</h1>
          {story && (
            <div
              className="story-editor__story-info-wrap"
              onMouseEnter={(e) => {
                if (storyTooltipLeaveRef.current) {
                  clearTimeout(storyTooltipLeaveRef.current);
                  storyTooltipLeaveRef.current = null;
                }
                const r = e.currentTarget.getBoundingClientRect();
                setStoryTooltipPos(placeTooltipBeside(r));
              }}
              onMouseLeave={() => {
                storyTooltipLeaveRef.current = setTimeout(() => setStoryTooltipPos(null), 200);
              }}
            >
              <span className="story-editor__story-info-trigger" aria-label="Ver informações da história">?</span>
            </div>
          )}
        </div>
        {story && storyTooltipPos && createPortal(
          <div
            className="scene-chars-modal__polaroid-tooltip scene-chars-modal__polaroid-tooltip--portal story-editor__story-tooltip"
            style={{ position: "fixed", left: storyTooltipPos.left, top: storyTooltipPos.top, zIndex: 100002 }}
            onMouseEnter={() => {
              if (storyTooltipLeaveRef.current) {
                clearTimeout(storyTooltipLeaveRef.current);
                storyTooltipLeaveRef.current = null;
              }
            }}
            onMouseLeave={() => setStoryTooltipPos(null)}
          >
            <div className="scene-chars-modal__polaroid-tooltip__body scenario-manager__polaroid-tooltip__body">
              <div className="scene-chars-tooltip__row">
                <div className="scene-chars-tooltip__label">Nome</div>
                <div className="scene-chars-tooltip__value">{story.name || "—"}</div>
              </div>
              <div className="scene-chars-tooltip__row">
                <div className="scene-chars-tooltip__label">Premissa</div>
                <div className="scene-chars-tooltip__value">{story.premissa || "—"}</div>
              </div>
              <div className="scene-chars-tooltip__row">
                <div className="scene-chars-tooltip__label">O que realmente aconteceu</div>
                <div className="scene-chars-tooltip__value">{story.o_que_aconteceu || "—"}</div>
              </div>
              <div className="scene-chars-tooltip__row">
                <div className="scene-chars-tooltip__label">Temas</div>
                <div className="scene-chars-tooltip__value">{story.temas || "—"}</div>
              </div>
              <div className="scene-chars-tooltip__row">
                <div className="scene-chars-tooltip__label">Atmosfera</div>
                <div className="scene-chars-tooltip__value">{story.atmosfera || "—"}</div>
              </div>
              <div className="scene-chars-tooltip__row">
                <div className="scene-chars-tooltip__label">Notas</div>
                <div className="scene-chars-tooltip__value">{story.notas || "—"}</div>
              </div>
            </div>
          </div>,
          document.body
        )}
        <label className="story-editor__autosave-toggle">
          <input
            type="checkbox"
            checked={autosaveEnabled}
            onChange={(e) => setAutosaveEnabled(e.target.checked)}
          />
          <span>Autosave</span>
        </label>
      </div>
      {err && (
        <p className="story-editor__error story-editor__error--inline" role="alert">
          {err}
        </p>
      )}

      <div className="story-editor__grid">
        <ScenarioManagerModal
          open={scenarioModalOpen}
          onClose={() => setScenarioModalOpen(false)}
          onSaved={loadScenarios}
          onRequestCreateScenario={onNavigateToCreateScenario}
          usedInStoryScenarioIds={[...scenarioIdsInStory] as string[]}
          onAddScenarioToStory={addScenarioToStory}
          onRemoveScenarioFromStory={removeScenarioFromStory}
        />

        <DndContext
          sensors={sensors}
          collisionDetection={rectIntersection}
          onDragEnd={handleDragEnd}
        >
        <section className="story-editor__scenarios" aria-label="Cenários">
          {activeScene?.is_narrative ? (
            <p className="story-editor__placeholder">Cena narrativa — sem cenário.</p>
          ) : (
            <div className="story-editor__scenarios-inner">
              <div className="story-editor__scenario-thumbs">
                {scenariosInStory.map((sc) => (
                  <DraggableScenarioThumb key={sc.id} scenario={sc} />
                ))}
              </div>
              <div className="story-editor__scenarios-actions">
                <button
                  type="button"
                  className="ui-btn ui-btn--ghost"
                  onClick={() => setScenarioModalOpen(true)}
                >
                  Gerenciar cenários
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="story-editor__scenes" aria-label="Cenas">
          <div className="story-editor__scenes-toolbar">
            <button
              type="button"
              className="ui-btn ui-btn--primary"
              disabled={creating}
              onClick={handleCreateScene}
            >
              {creating ? "Criando…" : "Nova cena"}
            </button>
          </div>
          <ul className="story-editor__scene-list">
            {scenes.map((s) => (
              <SortableSceneItem
                key={s.id}
                scene={s}
                isActive={s.id === activeSceneId}
                onSelect={() => trySwitchScene(s.id)}
                onOpenDetails={(e) => {
                  e.stopPropagation();
                  setSceneDetailsSceneId(s.id);
                }}
              />
            ))}
          </ul>
        </aside>

        {sceneDetailsScene && createPortal(
          <div
            className="ui-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Detalhes da cena"
          >
            <button
              className="ui-modal__backdrop"
              onClick={() => setSceneDetailsSceneId(null)}
              aria-label="Fechar"
            />
            <div className="ui-modal__card ui-card scene-details-modal">
              <h3 className="ui-modal__title">{sceneDetailsScene.title || "(sem título)"}</h3>
              {err && <p className="scenario-manager__error">{err}</p>}
              <dl className="scene-details-modal__meta">
                <dt>Tipo</dt>
                <dd>{sceneDetailsScene.is_narrative ? "Narrativa" : "Normal"}</dd>
                {!sceneDetailsScene.is_narrative && sceneDetailsScene.scenario_id && (
                  <>
                    <dt>Cenário</dt>
                    <dd>{scenarios.find((sc) => sc.id === sceneDetailsScene.scenario_id)?.name ?? sceneDetailsScene.scenario_id}</dd>
                  </>
                )}
                <dt>Personagens na cena</dt>
                <dd>{sceneDetailsCharacterIds.length}</dd>
                <dt>Corpo</dt>
                <dd className="scene-details-modal__body-preview">
                  {(sceneDetailsScene.body?.trim() || "(vazio)").slice(0, 200)}
                  {(sceneDetailsScene.body?.trim().length ?? 0) > 200 ? "…" : ""}
                </dd>
              </dl>
              <div className="ui-actions ui-modal__actions" style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="ui-btn ui-btn--primary"
                  onClick={handleDuplicateScene}
                  disabled={duplicating}
                >
                  {duplicating ? "Duplicando…" : "Duplicar"}
                </button>
                <button
                  type="button"
                  className="ui-btn ui-btn--ghost"
                  onClick={() => setSceneDetailsSceneId(null)}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        <main className="story-editor__main" aria-label="Cena ativa">
          {activeScene ? (
            <>
            <SceneScenarioDropZone
              sceneId={activeScene.id}
              currentScenarioId={activeScene.scenario_id}
              scenarioName={
                activeScene.scenario_id
                  ? scenarios.find((sc) => sc.id === activeScene.scenario_id)?.name ?? null
                  : null
              }
            >
              <SceneCharacterDropZone sceneId={activeScene.id}>
              <div
                className="story-editor__scene-content"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerMove={(e) => e.stopPropagation()}
              >
                <label className="ui-label">Título da cena</label>
                <input
                  type="text"
                  className="ui-field"
                  value={activeScene.title ?? ""}
                  onChange={(e) =>
                    setScenes((prev) =>
                      prev.map((s) =>
                        s.id === activeSceneId ? { ...s, title: e.target.value } : s
                      )
                    )
                  }
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (activeScene.title ?? "")) handleUpdateScene({ title: v });
                  }}
                  placeholder="Título"
                />
                <label className="ui-label" style={{ marginTop: 12 }}>
                  Tipo da cena
                </label>
                <select
                  className="ui-field"
                  value={activeScene.is_narrative ? "narrative" : "normal"}
                  onChange={(e) => {
                    const isNarrative = e.target.value === "narrative";
                    setScenes((prev) =>
                      prev.map((s) =>
                        s.id === activeSceneId ? { ...s, is_narrative: isNarrative } : s
                      )
                    );
                    handleUpdateScene({ is_narrative: isNarrative });
                  }}
                >
                  <option value="normal">Normal (cenário + personagens)</option>
                  <option value="narrative">Narrativa (só texto/imagens)</option>
                </select>
                {activeScene.is_narrative && (
                  <div className="story-editor__narrative-options" style={{ marginTop: 12 }}>
                    <label className="story-editor__autosave-toggle story-editor__narrative-black-toggle">
                      <input
                        type="checkbox"
                        checked={activeScene.narrative_black_start}
                        onChange={(e) => toggleNarrativeBlackStart(e.target.checked)}
                      />
                      <span>Tela preta inicial</span>
                    </label>
                  </div>
                )}
                <label className="ui-label" style={{ marginTop: 12 }}>
                  Descrição / corpo
                </label>
                <textarea
                  className="ui-field story-editor__scene-body-edit"
                  value={activeScene.body ?? ""}
                  onChange={(e) =>
                    setScenes((prev) =>
                      prev.map((s) =>
                        s.id === activeSceneId ? { ...s, body: e.target.value } : s
                      )
                    )
                  }
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v !== (activeScene.body ?? "")) handleUpdateScene({ body: v });
                  }}
                  placeholder="Texto da cena…"
                  rows={24}
                />
                <div className="story-editor__scene-actions">
                  <button
                    type="button"
                    className="ui-btn"
                    disabled={sceneSaving}
                    onClick={handleSaveSceneClick}
                  >
                    {sceneSaving ? "Salvando…" : "Salvar cena"}
                  </button>
                  {sceneSaving && (
                    <span className="story-editor__placeholder" style={{ marginLeft: 12 }}>
                      Salvando…
                    </span>
                  )}
                </div>
              </div>
            <div className="story-editor__scene-col-preview">
              <ScenePreview
                isNormalScene={!activeScene.is_narrative}
                scenario={activeScene.scenario_id ? scenarios.find((sc) => sc.id === activeScene.scenario_id) ?? null : null}
                sceneCharacterIds={sceneCharacterIds}
                gmCharacters={gmCharacters}
                gmEmail={user?.email}
                narrativeSlide={activeScene.is_narrative ? currentNarrativeSlide : undefined}
                narrativeEditable={Boolean(activeScene.is_narrative && currentNarrativeSlide && !currentNarrativeSlide.isBlack && currentNarrativeSlide.url)}
                onNarrativeCropChange={(crop) => {
                  if (!currentNarrativeSlide || currentNarrativeSlide.order_index == null) return;
                  updateNarrativeImageCrop(currentNarrativeSlide.order_index, crop);
                }}
              />
              {activeScene.is_narrative && (
                <div className="story-editor__narrative-panel">
                  <div className="story-editor__narrative-preview-controls">
                    <button
                      type="button"
                      className="ui-btn ui-btn--ghost"
                      disabled={narrativePreviewIndex <= 0}
                      onClick={() => setNarrativePreviewIndex((prev) => Math.max(0, prev - 1))}
                    >
                      ← Anterior
                    </button>
                    <span className="story-editor__narrative-preview-indicator">
                      {narrativeSlides.length === 0 ? "0 / 0" : `${narrativePreviewIndex + 1} / ${narrativeSlides.length}`}
                    </span>
                    <button
                      type="button"
                      className="ui-btn ui-btn--ghost"
                      disabled={narrativePreviewIndex >= narrativeSlides.length - 1}
                      onClick={() =>
                        setNarrativePreviewIndex((prev) => Math.min(narrativeSlides.length - 1, prev + 1))
                      }
                    >
                      Próxima →
                    </button>
                  </div>
                  <input
                    ref={narrativeImageInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="story-editor__narrative-images-input"
                    onChange={(e) => {
                      handleNarrativeImageUpload(e.target.files);
                      e.target.value = "";
                    }}
                    aria-label="Selecionar imagens"
                  />
                  <button
                    type="button"
                    className={
                      "ui-btn ui-btn--ghost story-editor__narrative-dropzone" +
                      (narrativeDropActive ? " story-editor__narrative-dropzone--active" : "")
                    }
                    disabled={narrativeImageUploading}
                    onClick={() => narrativeImageInputRef.current?.click()}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      setNarrativeDropActive(true);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setNarrativeDropActive(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                      setNarrativeDropActive(false);
                    }}
                    onDrop={handleNarrativeFileDrop}
                  >
                    {narrativeImageUploading
                      ? "Enviando imagens…"
                      : "Arraste imagem(ns) aqui ou clique para selecionar várias"}
                  </button>
                  {narrativeImagesLoading ? (
                    <p className="story-editor__placeholder">Carregando imagens…</p>
                  ) : narrativeSceneImages.length === 0 ? (
                    <p className="story-editor__placeholder">
                      {activeScene.narrative_black_start
                        ? "Só a tela preta inicial está ativa."
                        : "Nenhuma imagem enviada."}
                    </p>
                  ) : (
                    <ul className="story-editor__narrative-images-list">
                      {narrativeSceneImages.map((img) => (
                        <SortableNarrativeImageItem
                          key={img.order_index}
                          image={img}
                          isActive={currentNarrativeSlide?.order_index === img.order_index}
                          onSelect={() => {
                            const offset = activeScene.narrative_black_start ? 1 : 0;
                            setNarrativePreviewIndex(img.order_index + offset);
                          }}
                          onRemove={() => removeNarrativeImage(img.order_index)}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {!activeScene.is_narrative && (
                <div className="story-editor__scene-characters">
                  <label className="ui-label" style={{ marginTop: 12 }}>
                    Personagens nesta cena
                  </label>
                  {sceneCharacterIds.length === 0 ? (
                    <p className="story-editor__placeholder">Nenhum personagem. Arraste da barra à direita ou para o preview para adicionar.</p>
                  ) : (
                    <ul className="story-editor__scene-characters-list">
                      {sceneCharacterIds
                        .map((id) => gmCharacters.find((c) => c.id === id))
                        .filter(Boolean)
                        .map((c) => {
                          const k = gmCharacterKind(c!);
                          return (
                            <li key={c!.id} className="story-editor__scene-characters-item">
                              <img src={getAvatarUrl(c ?? undefined)} alt="" className="story-editor__char-thumb-avatar" />
                              <span className="story-editor__scene-characters-name-row">
                                <span className="story-editor__scene-characters-name">{c!.name}</span>
                                <span
                                  className={
                                    "story-editor__char-kind-badge" + (k === "NPC" ? " story-editor__char-kind-badge--npc" : "")
                                  }
                                >
                                  {k}
                                </span>
                              </span>
                              <button
                                type="button"
                                className="ui-btn ui-btn--ghost"
                                onClick={() => removeCharacterFromScene(c!.id)}
                              >
                                Remover
                              </button>
                            </li>
                          );
                        })}
                    </ul>
                  )}
                </div>
              )}
            </div>
              </SceneCharacterDropZone>
            </SceneScenarioDropZone>
            </>
          ) : (
            <p className="story-editor__placeholder story-editor__main-placeholder">
              {scenes.length === 0 ? "Crie uma cena para começar." : "Selecione uma cena."}
            </p>
          )}
        </main>

        <aside className="story-editor__characters" aria-label="Personagens">
          {activeScene?.is_narrative ? (
            <p className="story-editor__placeholder">Cena narrativa — sem personagens.</p>
          ) : activeScene ? (
            <div className="story-editor__characters-inner">
              <p className="story-editor__scene-drop-hint" style={{ marginBottom: 8 }}>
                Personagens da história. Arraste para a cena para adicionar.
              </p>
              {storyCharacterIds.length === 0 ? (
                <p className="story-editor__placeholder">
                  Nenhum personagem na história. Clique em &quot;Gerenciar personagens&quot; para adicionar.
                </p>
              ) : (
                <>
                  <div className="story-editor__characters-filter" role="group" aria-label="Filtrar por tipo de personagem">
                    {(
                      [
                        { key: "all" as const, label: "Todos" },
                        { key: "PC" as const, label: "PCs" },
                        { key: "NPC" as const, label: "NPCs" },
                      ] as const
                    ).map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        className={
                          "ui-btn ui-btn--ghost story-editor__characters-filter-btn" +
                          (storyCharKindFilter === key ? " is-active" : "")
                        }
                        onClick={() => setStoryCharKindFilter(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <ul className="story-editor__characters-list">
                    {filteredStoryPanelChars.map((c) => (
                      <li key={c.id} className="story-editor__characters-item">
                        <DraggableCharacterThumb character={c} />
                      </li>
                    ))}
                  </ul>
                  {storyCharacterIds.length > 0 && filteredStoryPanelChars.length === 0 && (
                    <p className="story-editor__placeholder" style={{ marginTop: 8 }}>
                      Nenhum personagem neste filtro.
                    </p>
                  )}
                </>
              )}
              <div className="story-editor__characters-actions">
                <button
                  type="button"
                  className="ui-btn ui-btn--ghost"
                  onClick={() => setCharacterModalOpen(true)}
                >
                  Gerenciar personagens
                </button>
              </div>
            </div>
          ) : (
            <p className="story-editor__placeholder">Selecione uma cena.</p>
          )}
        </aside>

        <SceneCharactersModal
          open={characterModalOpen}
          onClose={() => setCharacterModalOpen(false)}
          storyId={storyId}
          gmCharacters={gmCharacters}
          storyCharacterIds={storyCharacterIds}
          onSaved={() => {
            loadStoryCharacters();
            loadGmCharacters();
          }}
          onEditCharacter={(c) => {
            setCharacterModalOpen(false);
            setEditingCharacterId(c.id);
          }}
          onRequestCreateCharacter={onNavigateToCreateCharacter}
        />

        {editingCharacterId != null && createPortal(
          <div className="story-editor__edit-char-overlay" role="dialog" aria-modal="true" aria-label="Editar personagem">
            <div className="story-editor__edit-char-overlay-inner">
              <EditCharacterScreen
                scope="GM"
                character={gmCharToCharacter(gmCharacters.find((c) => c.id === editingCharacterId) ?? null)}
                onBack={() => {
                  setEditingCharacterId(null);
                  loadGmCharacters();
                }}
              />
            </div>
          </div>,
          document.body
        )}
        </DndContext>
      </div>
    </div>
  );
}
