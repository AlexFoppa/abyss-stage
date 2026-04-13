import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { RoomEvent, ParticipantEvent, Track, type Room, type Participant } from "livekit-client";
import { useAuth } from "./auth/AuthProvider";
import { api } from "./api";
import { scenarioCropFromScenario, scenarioImageUrl } from "./scenarioCrop";
import { StageLayout } from "./ui/StageLayout";
import { Screen } from "./ui/Screen";
import { LoginScreen } from "./screens/LoginScreen";
import { ForceResetScreen } from "./screens/ForceResetScreen";
import { LobbyScreen, type LobbyParticipant } from "./screens/LobbyScreen";
import { CreateCharacterScreen } from "./screens/CreateCharacterScreen";
import { SelectCharacterScreen } from "./screens/SelectCharacterScreen";
import { EditCharacterScreen } from "./screens/EditCharacterScreen";
import { HomeGMScreen } from "./screens/HomeGMScreen";
import { GMCharactersScreen } from "./screens/GMCharactersScreen";
import { GMScenariosScreen } from "./screens/GMScenariosScreen";
import { StoryListScreen } from "./screens/StoryListScreen";
import { StoryEditorScreen } from "./screens/StoryEditorScreen";
import { EspetaculoScreen } from "./screens/EspetaculoScreen";
import { StageView } from "./screens/StageView";
import { SceneStagePreview, ScenarioBackground } from "./screens/SceneStagePreview";
import { EditProfileScreen } from "./screens/EditProfileScreen";
import type { GMCharacter } from "./types/character";
import { getAvatarUrl } from "./utils/avatar";

type View =
  | "LOGIN"
  | "RESET"
  | "GM_HOME"
  | "GM_CHARACTERS"
  | "GM_SCENARIOS"
  | "GM_STORIES"
  | "GM_STORY_EDITOR"
  | "GM_ESPETACULO"
  | "LOBBY"
  | "CREATE_CHARACTER"
  | "SELECT_CHARACTER"
  | "EDIT_CHARACTER"
  | "EDIT_PROFILE";

type NarrativeSlide = {
  id: string;
  url: string | null;
  isBlack: boolean;
  crop: { x: number; y: number; width: number; height: number } | null;
  order_index: number | null;
};

type ShowSceneRecord = {
  id: string;
  story_id: string;
  title: string;
  body: string;
  order_index: number;
  is_narrative: boolean;
  narrative_black_start: boolean;
  scenario_id: string | null;
};

type ShowSceneSummary = {
  id: string;
  title: string;
  is_narrative: boolean;
};

type ShowSceneState = {
  storyId: string;
  sceneId: string;
  scenarioId: string | null;
  scenarioImageUrl: string | null;
  scenarioCrop: { x: number; y: number; width: number; height: number } | null;
  narrativeSlides?: NarrativeSlide[];
  currentNarrativeIndex?: number;
  sceneTitle: string;
  sceneBody: string;
  isNarrativeScene: boolean;
  storyScenes: ShowSceneSummary[];
};

type ScenePreviewState = {
  mode: "normal" | "narrative";
  scenarioImageUrl: string | null;
  scenarioCrop: { x: number; y: number; width: number; height: number } | null;
  narrativePreviewSlide?: NarrativeSlide | null;
  sceneCharacterIds: number[];
};

/** Posição do menu flutuante unificado (áudio + livro/ficha/status/inventário). */
const persistedFloatingMenuPos = { right: 24, bottom: 180 };
const FLOATING_MENU_CHARACTER_BAR_HEIGHT = 194; /* 4 botões 44px + 3 gaps 6px */

/** Sinal jogador→mestre (conteúdo pesado / pausa); só o mestre trata na UI. */
type SafetyPanicSignal = {
  id: string;
  at: number;
  identity: string;
  displayName?: string;
  email?: string;
  characterId?: number;
  characterName?: string;
};

/** Preview 0–9 no lobby: troca de imagem ~1s. Ao receber LiveKit, o fim usa o relógio local (evita skew entre jogador e mestre). */
const EXPRESSION_LOBBY_PREVIEW_MS = 1000;

function expressionMessageCharacterIds(msg: { characterIds?: unknown; characterId?: unknown }): number[] {
  if (Array.isArray(msg.characterIds)) {
    const out: number[] = [];
    for (const x of msg.characterIds) {
      if (typeof x === "number" && Number.isFinite(x)) out.push(x);
      else if (typeof x === "string" && /^\d+$/.test(x)) out.push(parseInt(x, 10));
    }
    return out;
  }
  if (typeof msg.characterId === "number" && Number.isFinite(msg.characterId)) return [msg.characterId];
  if (typeof msg.characterId === "string" && /^\d+$/.test(msg.characterId)) return [parseInt(msg.characterId, 10)];
  return [];
}

function readExpressionUrlMap(raw: unknown): Record<number, string> | undefined {
  if (raw == null || typeof raw !== "object") return undefined;
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const id = Number(k);
    if (!Number.isFinite(id)) continue;
    if (typeof v === "string" && v !== "") out[id] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** URLs já resolvidas no mestre (atlas + lobby); os jogadores não têm slot→URL completo dos outros PCs. */
function urlsForExpressionAtSlot(
  characterIds: number[],
  slot: number,
  gmStageSlotImagesBy: Record<number, Record<number, string>>,
  gmExpressionTargets: Array<{ id: number; imageUrl?: string | null }>,
  displayParticipants: LobbyParticipant[]
): Record<number, string> {
  const out: Record<number, string> = {};
  for (const id of characterIds) {
    const gmSlots = gmStageSlotImagesBy[id];
    let u: string | undefined;
    if (gmSlots && typeof gmSlots === "object") {
      u = gmSlots[slot] ?? gmSlots[0];
    }
    if (u == null) {
      const p = displayParticipants.find((q) => !q.is_gm && q.character_id === id);
      const fromLobby = p?.character_image_by_slot;
      if (fromLobby && typeof fromLobby === "object") {
        u = fromLobby[slot] ?? fromLobby[0];
      }
      if (u == null) {
        const t = gmExpressionTargets.find((x) => x.id === id);
        u = (t?.imageUrl ?? undefined) || (p?.character_image_url ?? undefined) || undefined;
      }
    }
    if (typeof u === "string" && u !== "") out[id] = u;
  }
  for (const id of characterIds) {
    if (out[id] != null) continue;
    const t = gmExpressionTargets.find((x) => x.id === id);
    if (typeof t?.imageUrl === "string" && t.imageUrl !== "") out[id] = t.imageUrl;
  }
  return out;
}

export function Routes() {
  const { user, loading, viewMode, setViewMode, logout } = useAuth();

  const logged = !!user && !user.must_reset_password;
  const isGM = user?.role === "GM";
  
  const effectiveRole = isGM && viewMode === "PLAYER" ? "PLAYER" : user?.role;
  const showBackstage = !!user && effectiveRole === "PLAYER" && !user.must_reset_password;

  const [subView, setSubView] = useState<
    "LOBBY" | "CREATE_CHARACTER" | "SELECT_CHARACTER" | "EDIT_CHARACTER" | "EDIT_PROFILE"
  >("LOBBY");

  const [gmSubView, setGmSubView] = useState<"GM_HOME" | "GM_CHARACTERS" | "GM_SCENARIOS" | "GM_STORIES" | "GM_STORY_EDITOR" | "GM_ESPETACULO">("GM_HOME");
  const [editingStoryId, setEditingStoryId] = useState<string | null>(null);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [returnToStoryId, setReturnToStoryId] = useState<string | null>(null);
  const [stageMode, setStageMode] = useState<"IDLE" | "ZOOM_IN">("IDLE");

  const [floatingMenuPos, setFloatingMenuPosState] = useState(() => ({ ...persistedFloatingMenuPos }));
  const setFloatingMenuPos = useCallback((pos: { right: number; bottom: number }) => {
    persistedFloatingMenuPos.right = pos.right;
    persistedFloatingMenuPos.bottom = pos.bottom;
    setFloatingMenuPosState(pos);
  }, []);

  const [selectedCharacter, setSelectedCharacter] = useState<null | {
    id: number;
    name: string;
    system: string;
    imageUrl?: string | null;
  }>(null);
  /** Mestre: personagens seleccionados no palco cujas expressões 0–9 o mestre controla (todos em simultâneo). */
  const [gmExpressionTargets, setGmExpressionTargets] = useState<
    Array<{ id: number; name: string; system: string; imageUrl?: string | null }>
  >([]);

  const [editingCharacter, setEditingCharacter] = useState<null | {
    id: number;
    name: string;
    concept: string;
    system: string;
    backstory: string;
    notes: string;
    systems?: string[];
  }>(null);

  const [editingFromGM, setEditingFromGM] = useState(false);
  const [editingReturnGmView, setEditingReturnGmView] = useState<"GM_CHARACTERS" | "GM_STORY_EDITOR" | null>(null);
  const [createCharacterKind, setCreateCharacterKind] = useState<"PC" | "NPC">("PC");

  const [show, setShow] = useState<null | {
    id: string;
    startedAt: number;
    storyId: string;
    sceneId: string;
    scenarioId: string | null;
    scenarioImageUrl: string | null;
    scenarioCrop: { x: number; y: number; width: number; height: number } | null;
    narrativeSlides?: NarrativeSlide[];
    currentNarrativeIndex?: number;
    sceneTitle: string;
    sceneBody: string;
    isNarrativeScene: boolean;
    storyScenes: ShowSceneSummary[];
    /** Estado do palco (PC/NPC, posições, dados) restaurado na reconexão. */
    stageState?: {
      characters?: Array<{ id: number; name: string; side: string; imageUrl?: string | null; xPct?: number; visible: boolean }>;
      diceVisible?: boolean;
      diceCount?: number;
      diceGolden?: boolean[];
      diceLastResult?: number[];
      diceShowAuras?: boolean;
    } | null;
  }>(null);
  const [showTick, setShowTick] = useState(0);
  const [showSceneMenuOpen, setShowSceneMenuOpen] = useState(false);
  const [improvisationMode, setImprovisationMode] = useState(false);
  const [improvisationScenarios, setImprovisationScenarios] = useState<
    Array<{
      id: string;
      name: string;
      image_storage_key: string | null;
      crop_x?: number | null;
      crop_y?: number | null;
      crop_width?: number | null;
      crop_height?: number | null;
    }>
  >([]);
  const [improvisationCharacters, setImprovisationCharacters] = useState<GMCharacter[]>([]);
  /** Cenário atual no improviso: id e descrição (do drag ou da cena), para o painel (i) e "Salvar como nova cena". */
  const [improvisationScenarioId, setImprovisationScenarioId] = useState<string | null>(null);
  const [improvisationScenarioDescription, setImprovisationScenarioDescription] = useState<string>("");
  const [sceneInfoOpen, setSceneInfoOpen] = useState(false);
  const [sceneInfoDraft, setSceneInfoDraft] = useState({ title: "", body: "" });
  const [sceneInfoSaving, setSceneInfoSaving] = useState(false);
  const [sceneSaveAsNewSaving, setSceneSaveAsNewSaving] = useState(false);
  const [showSceneSwitching, setShowSceneSwitching] = useState(false);
  const [previewHoverSceneId, setPreviewHoverSceneId] = useState<string | null>(null);
  const [previewCardRect, setPreviewCardRect] = useState<DOMRect | null>(null);
  const [previewBySceneId, setPreviewBySceneId] = useState<Record<string, ScenePreviewState | undefined>>({});
  const [previewLoadingSceneId, setPreviewLoadingSceneId] = useState<string | null>(null);
  const [showMenuCharacters, setShowMenuCharacters] = useState<GMCharacter[]>([]);
  const previewTriggerRef = useRef<HTMLDivElement | null>(null);
  const closePreviewTimeoutRef = useRef<number | null>(null);

  const [liveKitRoom, setLiveKitRoom] = useState<Room | null>(null);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [speakingByIdentity, setSpeakingByIdentity] = useState<Record<string, boolean>>({});

  const [lobbyParticipants, setLobbyParticipants] = useState<LobbyParticipant[]>([]);
  /** Chave estável: só muda quando o conjunto de character_id no lobby muda; evita refetch em StageView a cada poll. */
  const lobbyCharacterIdsComputed = useMemo(
    () =>
      [...new Set(lobbyParticipants.map((p) => p.character_id).filter((id): id is number => id != null))]
        .sort((a, b) => a - b)
        .join(","),
    [lobbyParticipants]
  );
  const [lobbyCharacterIdsKeyStable, setLobbyCharacterIdsKeyStable] = useState(lobbyCharacterIdsComputed);
  const prevLobbyCharacterIdsKeyRef = useRef(lobbyCharacterIdsComputed);
  useEffect(() => {
    if (lobbyCharacterIdsComputed !== prevLobbyCharacterIdsKeyRef.current) {
      prevLobbyCharacterIdsKeyRef.current = lobbyCharacterIdsComputed;
      setLobbyCharacterIdsKeyStable(lobbyCharacterIdsComputed);
    }
  }, [lobbyCharacterIdsComputed]);
  const [actorOffsets, setActorOffsets] = useState<Record<string, number>>({});
  const actorDragRef = useRef<{ identity: string; startX: number; startOffset: number } | null>(null);

  /* Expressão 0–9: slot de armazenamento (0=Padrão, 1=Assustado, … 9=Off). Tecla 1→slot 0, tecla 0→slot 9. */
  const [currentExpressionSlot, setCurrentExpressionSlot] = useState(0); // 0 = Padrão
  const [temporaryOverride, setTemporaryOverride] = useState<{ slot: number; until: number } | null>(null);
  /** Override temporário por identity (recebido via LiveKit). */
  const [expressionOverrideByIdentity, setExpressionOverrideByIdentity] = useState<
    Record<string, { slot: number; until: number }>
  >({});
  /** Override por character_id (mestre a controlar expressões de um alvo no palco). */
  const [expressionOverrideByCharacterId, setExpressionOverrideByCharacterId] = useState<
    Record<number, { slot: number; until: number; previewUrl?: string | null }>
  >({});
  /** Retrato por personagem após expression/current do mestre (URL no slot fixo; jogadores sem atlas completo dos outros). */
  const [expressionRemotePortraitByCharacterId, setExpressionRemotePortraitByCharacterId] = useState<
    Record<number, string>
  >({});
  const [expressionCurrentByCharacterId, setExpressionCurrentByCharacterId] = useState<Record<number, number>>({});
  /** Remove cada preview remoto no instante `until` (evita mapa preso + useMemo com tempo congelado). */
  const expressionOverrideClearTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const expressionOverrideCharClearTimeoutsRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  /** Último lobby + atlas do mestre para montar URLs nas mensagens LiveKit (fixExpression corre antes de `displayParticipants` no ficheiro). */
  const expressionPublishContextRef = useRef<{
    displayParticipants: LobbyParticipant[];
    gmStageSlotImagesBy: Record<number, Record<number, string>>;
    gmExpressionTargets: Array<{ id: number; imageUrl?: string | null }>;
  }>({ displayParticipants: [], gmStageSlotImagesBy: {}, gmExpressionTargets: [] });
  /** Slot atual por identity (recebido via LiveKit expression/current). */
  const [expressionCurrentByIdentity, setExpressionCurrentByIdentity] = useState<Record<string, number>>({});
  useEffect(() => {
    return () => {
      Object.values(expressionOverrideClearTimeoutsRef.current).forEach((t) => clearTimeout(t));
      expressionOverrideClearTimeoutsRef.current = {};
      Object.values(expressionOverrideCharClearTimeoutsRef.current).forEach((t) => clearTimeout(t));
      expressionOverrideCharClearTimeoutsRef.current = {};
    };
  }, []);
  const expressionKeyDownRef = useRef<{ key: string; slot: number; time: number } | null>(null);
  const expressionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expressionInitializedFromLobbyRef = useRef(false);
  /** Fallback slot→URL só quando GET /lobby ainda não trouxe `character_image_by_slot` para o jogador local. */
  const [localCharacterImageBySlot, setLocalCharacterImageBySlot] = useState<Record<number, string>>({});
  /** Mestre no palco: mapa character_id → (slot → URL) para vários alvos à vez. */
  const [gmStageSlotImagesBy, setGmStageSlotImagesBy] = useState<Record<number, Record<number, string>>>({});

  const [safetySignals, setSafetySignals] = useState<SafetyPanicSignal[]>([]);

  const dismissSafetySignal = useCallback((id: string) => {
    setSafetySignals((prev) => prev.filter((s) => s.id !== id));
  }, []);
  const dismissAllSafetySignals = useCallback(() => {
    setSafetySignals([]);
  }, []);

  useEffect(() => {
    setSafetySignals([]);
  }, [show?.id]);

  useEffect(() => {
    setExpressionRemotePortraitByCharacterId({});
  }, [show?.id]);

  useEffect(() => {
    if (show == null && isGM) setGmExpressionTargets([]);
  }, [show, isGM]);

  const onGmExpressionTargetsChange = useCallback(
    (targets: { id: number; name: string; imageUrl?: string | null }[]) => {
      if (!isGM) return;
      setGmExpressionTargets(
        targets.map((t) => ({
          id: t.id,
          name: t.name,
          system: "",
          imageUrl: t.imageUrl ?? null,
        }))
      );
    },
    [isGM]
  );

  const gmExpressionCharacterIds = useMemo(
    () => gmExpressionTargets.map((t) => t.id),
    [gmExpressionTargets]
  );
  const gmExpressionCharacterIdsKey = useMemo(
    () => [...gmExpressionCharacterIds].sort((a, b) => a - b).join(","),
    [gmExpressionCharacterIds]
  );

  const expressionTargetId = isGM ? (gmExpressionTargets[0]?.id ?? null) : (selectedCharacter?.id ?? null);

  const view: View = useMemo(() => {
    if (loading) return "LOGIN";
    if (!user) return "LOGIN";
    if (user.must_reset_password) return "RESET";
    if (subView === "CREATE_CHARACTER" || subView === "EDIT_CHARACTER" || subView === "EDIT_PROFILE") return subView;

    if (effectiveRole === "GM") return gmSubView;
    return subView;
  }, [user, loading, subView, effectiveRole, gmSubView]);

  /* Bootstrap: ao reconectar com usuário logado, restaurar show ativo (GM vai direto ao espetáculo; jogador sem personagem vai para seleção). */
  const hasFetchedShowActiveRef = useRef(false);
  useEffect(() => {
    if (!logged) {
      hasFetchedShowActiveRef.current = false;
      return;
    }
    if (hasFetchedShowActiveRef.current) return;
    hasFetchedShowActiveRef.current = true;
    fetch("/api/show/active", { credentials: "include" })
      .then((res) => {
        if (res.status === 204 || !res.ok) return null;
        return res.json();
      })
      .then((data: unknown) => {
        if (!data || typeof data !== "object" || typeof (data as { id?: unknown }).id !== "string") return;
        const d = data as {
          id: string;
          startedAt: number;
          storyId: string;
          sceneId: string;
          scenarioId?: string | null;
          scenarioImageUrl?: string | null;
          scenarioCrop?: { x: number; y: number; width: number; height: number } | null;
          narrativeSlides?: NarrativeSlide[];
          currentNarrativeIndex?: number;
          sceneTitle: string;
          sceneBody: string;
          isNarrativeScene: boolean;
          storyScenes: ShowSceneSummary[];
          stageState?: {
            characters?: Array<{ id: number; name: string; side: string; imageUrl?: string | null; xPct?: number; visible: boolean }>;
            diceVisible?: boolean;
            diceCount?: number;
            diceGolden?: boolean[];
            diceLastResult?: number[];
            diceShowAuras?: boolean;
          } | null;
        };
        if (
          typeof d.startedAt !== "number" ||
          typeof d.storyId !== "string" ||
          typeof d.sceneId !== "string" ||
          typeof d.sceneTitle !== "string" ||
          typeof d.sceneBody !== "string" ||
          typeof d.isNarrativeScene !== "boolean" ||
          !Array.isArray(d.storyScenes)
        )
          return;
        setShow({
          id: d.id,
          startedAt: d.startedAt,
          storyId: d.storyId,
          sceneId: d.sceneId,
          scenarioId: d.scenarioId ?? null,
          scenarioImageUrl: d.scenarioImageUrl ?? null,
          scenarioCrop: d.scenarioCrop ?? null,
          narrativeSlides: d.narrativeSlides,
          currentNarrativeIndex: d.currentNarrativeIndex,
          sceneTitle: d.sceneTitle,
          sceneBody: d.sceneBody,
          isNarrativeScene: d.isNarrativeScene,
          storyScenes: d.storyScenes,
          stageState: d.stageState ?? undefined,
        });
        if (isGM) {
          setGmSubView("GM_ESPETACULO");
        }
        /* Jogador: mantém-se no lobby para áudio primeiro; com show activo, a UI indica mesa em jogo e escolha de personagem (não fluxo de “visitante”). */
      })
      .catch(() => {});
  }, [logged, isGM]);

  useEffect(() => {
    setStageMode(view === "CREATE_CHARACTER" || view === "EDIT_CHARACTER" ? "ZOOM_IN" : "IDLE");
  }, [view]);

  const displayNameForUser = user ? (user.name?.trim() || user.email) : "";

  useEffect(() => {
    if (!show) return;
    const t = setInterval(() => setShowTick((x) => x + 1), 200);
    return () => clearInterval(t);
  }, [show?.id]);

  const loadStoryScenes = useCallback(async (storyId: string) => {
    const scenes = await api<ShowSceneRecord[]>(`/api/gm/stories/${storyId}/scenes`);
    return Array.isArray(scenes)
      ? [...scenes].sort((a, b) => a.order_index - b.order_index)
      : [];
  }, []);

  const loadNarrativeSlides = useCallback(async (storyId: string, scene: ShowSceneRecord) => {
    const list = await api<Array<{
      order_index: number;
      storage_key: string;
      url: string;
      crop_x?: number | null;
      crop_y?: number | null;
      crop_width?: number | null;
      crop_height?: number | null;
    }>>(`/api/gm/stories/${storyId}/scenes/${scene.id}/images`);
    const imageSlides: NarrativeSlide[] = Array.isArray(list)
      ? list.map((img) => ({
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
        }))
      : [];
    return [
      ...(scene.narrative_black_start
        ? [{ id: "black-start", url: null, isBlack: true, crop: null, order_index: null }]
        : []),
      ...imageSlides,
    ];
  }, []);

  const buildShowSceneState = useCallback(
    async (storyId: string, sceneId: string, existingScenes?: ShowSceneRecord[]) => {
      const scenes = existingScenes ?? (await loadStoryScenes(storyId));
      const scene = scenes.find((item) => item.id === sceneId);
      if (!scene) throw new Error("Cena não encontrada");

      const base: ShowSceneState = {
        storyId,
        sceneId: scene.id,
        scenarioId: scene.scenario_id,
        scenarioImageUrl: null,
        scenarioCrop: null,
        narrativeSlides: undefined,
        currentNarrativeIndex: undefined,
        sceneTitle: scene.title,
        sceneBody: scene.body,
        isNarrativeScene: scene.is_narrative,
        storyScenes: scenes.map((item) => ({
          id: item.id,
          title: item.title,
          is_narrative: item.is_narrative,
        })),
      };

      if (scene.is_narrative) {
        const slides = await loadNarrativeSlides(storyId, scene);
        return {
          ...base,
          narrativeSlides: slides,
          currentNarrativeIndex: slides.length > 0 ? 0 : undefined,
        } satisfies ShowSceneState;
      }

      if (scene.scenario_id) {
        const scenario = await api<{
          image_storage_key: string | null;
          crop_x?: number | null;
          crop_y?: number | null;
          crop_width?: number | null;
          crop_height?: number | null;
        }>(`/api/gm/scenarios/${scene.scenario_id}`);
        return {
          ...base,
          scenarioImageUrl: scenarioImageUrl(scenario),
          scenarioCrop: scenarioCropFromScenario(scenario),
        } satisfies ShowSceneState;
      }

      return base;
    },
    [loadNarrativeSlides, loadStoryScenes]
  );

  const loadScenePreview = useCallback(
    async (storyId: string, sceneId: string) => {
      const scenes = await loadStoryScenes(storyId);
      const scene = scenes.find((item) => item.id === sceneId);
      if (!scene) throw new Error("Cena não encontrada");
      if (scene.is_narrative) {
        const slides = await loadNarrativeSlides(storyId, scene);
        return {
          mode: "narrative",
          scenarioImageUrl: null,
          scenarioCrop: null,
          narrativePreviewSlide: slides[0] ?? null,
          sceneCharacterIds: [],
        } satisfies ScenePreviewState;
      }
      let scenarioImage = null;
      let crop = null;
      if (scene.scenario_id) {
        const scenario = await api<{
          image_storage_key: string | null;
          crop_x?: number | null;
          crop_y?: number | null;
          crop_width?: number | null;
          crop_height?: number | null;
        }>(`/api/gm/scenarios/${scene.scenario_id}`);
        scenarioImage = scenarioImageUrl(scenario);
        crop = scenarioCropFromScenario(scenario);
      }
      const chars = await api<{ character_ids: number[] }>(`/api/gm/stories/${storyId}/scenes/${sceneId}/characters`);
      return {
        mode: "normal",
        scenarioImageUrl: scenarioImage,
        scenarioCrop: crop,
        narrativePreviewSlide: null,
        sceneCharacterIds: chars.character_ids ?? [],
      } satisfies ScenePreviewState;
    },
    [loadNarrativeSlides, loadStoryScenes]
  );

  const showPhase = useMemo(() => {
    if (!show) return null;
    const countdownMs = 10_000;
    const t = Date.now();
    const elapsed = t - show.startedAt;
    /* Se o relógio do cliente está atrás do mestre, elapsed pode ser negativo e o countdown viraria centenas de segundos. Tratar como show já iniciado. */
    if (elapsed < 0) return "stage" as const;
    if (elapsed < countdownMs) return "countdown" as const;
    if (elapsed < countdownMs + 1000) return "sliding" as const;
    if (elapsed < countdownMs + 2000) return "half" as const;
    return "stage" as const;
  }, [show, showTick]);

  const countdownSeconds = useMemo(() => {
    if (!show || showPhase !== "countdown") return 0;
    const countdownMs = 10_000;
    const t = Date.now();
    const elapsed = t - show.startedAt;
    if (elapsed < 0) return 0;
    const remaining = Math.max(0, countdownMs - elapsed);
    return Math.max(1, Math.ceil(remaining / 1000));
  }, [show, showPhase, showTick]);

  const espetaculoPhase =
    showPhase === "sliding" || showPhase === "half" || showPhase === "stage" ? showPhase : null;

  const isStageMenuUnified = !!show && (showPhase === "half" || showPhase === "stage");

  useEffect(() => {
    if (!show) {
      setSceneInfoDraft({ title: "", body: "" });
      setShowSceneMenuOpen(false);
      setSceneInfoOpen(false);
      setPreviewHoverSceneId(null);
      return;
    }
    setSceneInfoDraft({ title: show.sceneTitle, body: show.sceneBody });
  }, [show?.sceneId, show?.sceneTitle, show?.sceneBody]);

  useEffect(() => {
    if (!show || !isGM) {
      setShowMenuCharacters([]);
      return;
    }
    let cancelled = false;
    api<GMCharacter[]>("/api/gm/characters")
      .then((list) => {
        if (!cancelled) setShowMenuCharacters(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setShowMenuCharacters([]);
      });
    return () => {
      cancelled = true;
    };
  }, [show?.storyId, isGM]);

  useEffect(() => {
    setPreviewBySceneId({});
    setPreviewHoverSceneId(null);
    setPreviewLoadingSceneId(null);
  }, [show?.storyId]);

  /* Ao final da contagem, jogador sai de seleção/criar/editar personagem para ver o palco. */
  useEffect(() => {
    if (effectiveRole === "PLAYER" && show && showPhase !== "countdown" && showPhase !== null) {
      setSubView("LOBBY");
    }
  }, [effectiveRole, show?.id, showPhase]);

  useEffect(() => {
    if (!liveKitRoom) return;

    const decoder = new TextDecoder();
    const onDataReceived = (
      payload: Uint8Array,
      participant?: Participant,
      _kind?: unknown,
      topic?: string
    ) => {
      let msg: any;
      try {
        msg = JSON.parse(decoder.decode(payload));
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object") return;

      /* Expressão: preview ~1s = troca de imagem (slot); fixação = expression/current + lobby. */
      if (msg.type === "expression/override") {
        const identity = typeof msg.identity === "string" ? msg.identity : participant?.identity;
        const characterIds = expressionMessageCharacterIds(msg);
        const slot = typeof msg.slot === "number" && msg.slot >= 0 && msg.slot <= 9 ? msg.slot : 0;
        const localUntil = Date.now() + EXPRESSION_LOBBY_PREVIEW_MS;
        if (characterIds.length > 0) {
          const previewById = readExpressionUrlMap(msg.previewUrlByCharacterId);
          for (const characterId of characterIds) {
            const prevClear = expressionOverrideCharClearTimeoutsRef.current[characterId];
            if (prevClear) clearTimeout(prevClear);
            expressionOverrideCharClearTimeoutsRef.current[characterId] = setTimeout(() => {
              setExpressionOverrideByCharacterId((prev) => {
                const cur = prev[characterId];
                if (!cur || cur.until !== localUntil) return prev;
                const next = { ...prev };
                delete next[characterId];
                return next;
              });
              delete expressionOverrideCharClearTimeoutsRef.current[characterId];
            }, EXPRESSION_LOBBY_PREVIEW_MS);
          }
          setExpressionOverrideByCharacterId((prev) => {
            const next = { ...prev };
            for (const characterId of characterIds) {
              const pv = previewById?.[characterId];
              next[characterId] = {
                slot,
                until: localUntil,
                ...(pv != null ? { previewUrl: pv } : {}),
              };
            }
            return next;
          });
        } else if (identity) {
          const prevClear = expressionOverrideClearTimeoutsRef.current[identity];
          if (prevClear) clearTimeout(prevClear);
          setExpressionOverrideByIdentity((prev) => ({ ...prev, [identity]: { slot, until: localUntil } }));
          expressionOverrideClearTimeoutsRef.current[identity] = setTimeout(() => {
            setExpressionOverrideByIdentity((prev) => {
              const cur = prev[identity];
              if (!cur || cur.until !== localUntil) return prev;
              const next = { ...prev };
              delete next[identity];
              return next;
            });
            delete expressionOverrideClearTimeoutsRef.current[identity];
          }, EXPRESSION_LOBBY_PREVIEW_MS);
        }
        return;
      }
      if (msg.type === "expression/current") {
        const identity = typeof msg.identity === "string" ? msg.identity : participant?.identity;
        const characterIds = expressionMessageCharacterIds(msg);
        const expression_slot =
          typeof msg.expression_slot === "number" && msg.expression_slot >= 0 && msg.expression_slot <= 9
            ? msg.expression_slot
            : 0;
        if (characterIds.length > 0) {
          setExpressionCurrentByCharacterId((prev) => {
            const next = { ...prev };
            for (const characterId of characterIds) {
              next[characterId] = expression_slot;
            }
            return next;
          });
          const portraitById = readExpressionUrlMap(msg.portraitUrlByCharacterId);
          if (portraitById != null) {
            setExpressionRemotePortraitByCharacterId((prev) => {
              const next = { ...prev };
              for (const characterId of characterIds) {
                const u = portraitById[characterId];
                if (u != null) next[characterId] = u;
              }
              return next;
            });
          }
        }
        if (identity && characterIds.length === 0) {
          setExpressionCurrentByIdentity((prev) => ({ ...prev, [identity]: expression_slot }));
        }
        return;
      }

      if (msg.type === "safety/panic") {
        if (!isGM) return;
        if (topic != null && topic !== "" && topic !== "safety") return;
        const fromIdentity =
          typeof msg.identity === "string" && msg.identity.trim() !== ""
            ? msg.identity.trim()
            : participant?.identity;
        if (!fromIdentity || fromIdentity === "gm") return;
        const at = typeof msg.at === "number" && Number.isFinite(msg.at) ? msg.at : Date.now();
        const displayName = typeof msg.displayName === "string" ? msg.displayName.trim() : "";
        const email = typeof msg.email === "string" ? msg.email.trim() : "";
        const characterId =
          typeof msg.characterId === "number" && Number.isFinite(msg.characterId) ? msg.characterId : undefined;
        const characterName = typeof msg.characterName === "string" ? msg.characterName.trim() : "";
        const id =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${at}-${fromIdentity}-${Math.random().toString(36).slice(2, 9)}`;
        setSafetySignals((prev) => {
          const next: SafetyPanicSignal = {
            id,
            at,
            identity: fromIdentity,
            ...(displayName ? { displayName } : {}),
            ...(email ? { email } : {}),
            ...(characterId != null ? { characterId } : {}),
            ...(characterName ? { characterName } : {}),
          };
          return [...prev, next].sort((a, b) => a.at - b.at);
        });
        return;
      }

      const sceneTitle =
        typeof msg.sceneTitle === "string" ? msg.sceneTitle : "";
      const sceneBody =
        typeof msg.sceneBody === "string" ? msg.sceneBody : "";
      const isNarrativeScene = typeof msg.isNarrativeScene === "boolean" ? msg.isNarrativeScene : false;
      const storyScenes = Array.isArray(msg.storyScenes)
        ? msg.storyScenes
            .filter(
              (scene: unknown): scene is ShowSceneSummary =>
                !!scene &&
                typeof scene === "object" &&
                typeof (scene as ShowSceneSummary).id === "string" &&
                typeof (scene as ShowSceneSummary).title === "string" &&
                typeof (scene as ShowSceneSummary).is_narrative === "boolean"
            )
        : [];

      /* show/start: processar sempre (topic pode não vir no receptor em algumas versões/setups). */
      if (msg.type === "show/start") {
        const startedAtFromMsg = typeof msg.startedAt === "number" ? msg.startedAt : Number(msg.startedAt);
        const storyId = typeof msg.storyId === "string" ? msg.storyId : null;
        const sceneId = typeof msg.sceneId === "string" ? msg.sceneId : null;
        const scenarioId =
          msg.scenarioId == null ? null : typeof msg.scenarioId === "string" ? msg.scenarioId : null;
        const scenarioImageUrl =
          msg.scenarioImageUrl == null
            ? null
            : typeof msg.scenarioImageUrl === "string"
              ? msg.scenarioImageUrl
              : null;
        const rawCrop = msg.scenarioCrop;
        const scenarioCrop =
          rawCrop &&
          typeof rawCrop === "object" &&
          typeof (rawCrop as { x?: unknown }).x === "number" &&
          typeof (rawCrop as { y?: unknown }).y === "number" &&
          typeof (rawCrop as { width?: unknown }).width === "number" &&
          typeof (rawCrop as { height?: unknown }).height === "number" &&
          (rawCrop as { width: number }).width > 0 &&
          (rawCrop as { height: number }).height > 0
            ? {
                x: (rawCrop as { x: number }).x,
                y: (rawCrop as { y: number }).y,
                width: (rawCrop as { width: number }).width,
                height: (rawCrop as { height: number }).height,
              }
            : null;
        const narrativeSlides = Array.isArray(msg.narrativeSlides)
          ? msg.narrativeSlides.filter(
              (slide: unknown): slide is NarrativeSlide =>
                !!slide &&
                typeof slide === "object" &&
                typeof (slide as NarrativeSlide).id === "string" &&
                typeof (slide as NarrativeSlide).isBlack === "boolean"
            )
          : Array.isArray(msg.narrativeImageUrls)
            ? msg.narrativeImageUrls
                .filter((u: unknown): u is string => typeof u === "string")
                .map((url: string, index: number) => ({
                  id: `legacy-${index}`,
                  url,
                  isBlack: false,
                  crop: null,
                  order_index: index,
                }))
            : undefined;
        const id = typeof msg.showId === "string" ? msg.showId : String(startedAtFromMsg);
        if (!Number.isFinite(startedAtFromMsg) || !storyId || !sceneId) return;
        if (typeof console !== "undefined" && console.log) {
          console.log("[espetaculo] show/start received", { storyId, sceneId, from: participant?.identity });
        }
        setShow({
          id,
          startedAt: Date.now(),
          storyId,
          sceneId,
          scenarioId,
          scenarioImageUrl,
          scenarioCrop,
          narrativeSlides,
          currentNarrativeIndex: narrativeSlides?.length ? 0 : undefined,
          sceneTitle,
          sceneBody,
          isNarrativeScene,
          storyScenes,
        });
        return;
      }
      if (msg.type === "show/scene/change") {
        const id = typeof msg.showId === "string" ? msg.showId : null;
        const storyId = typeof msg.storyId === "string" ? msg.storyId : null;
        const sceneId = typeof msg.sceneId === "string" ? msg.sceneId : null;
        const scenarioId =
          msg.scenarioId == null ? null : typeof msg.scenarioId === "string" ? msg.scenarioId : null;
        const scenarioImageUrl =
          msg.scenarioImageUrl == null
            ? null
            : typeof msg.scenarioImageUrl === "string"
              ? msg.scenarioImageUrl
              : null;
        const rawCrop = msg.scenarioCrop;
        const scenarioCrop =
          rawCrop &&
          typeof rawCrop === "object" &&
          typeof (rawCrop as { x?: unknown }).x === "number" &&
          typeof (rawCrop as { y?: unknown }).y === "number" &&
          typeof (rawCrop as { width?: unknown }).width === "number" &&
          typeof (rawCrop as { height?: unknown }).height === "number" &&
          (rawCrop as { width: number }).width > 0 &&
          (rawCrop as { height: number }).height > 0
            ? {
                x: (rawCrop as { x: number }).x,
                y: (rawCrop as { y: number }).y,
                width: (rawCrop as { width: number }).width,
                height: (rawCrop as { height: number }).height,
              }
            : null;
        const narrativeSlides = Array.isArray(msg.narrativeSlides)
          ? msg.narrativeSlides.filter(
              (slide: unknown): slide is NarrativeSlide =>
                !!slide &&
                typeof slide === "object" &&
                typeof (slide as NarrativeSlide).id === "string" &&
                typeof (slide as NarrativeSlide).isBlack === "boolean"
            )
          : undefined;
        const currentNarrativeIndex =
          typeof msg.currentNarrativeIndex === "number" && Number.isFinite(msg.currentNarrativeIndex)
            ? msg.currentNarrativeIndex
            : narrativeSlides?.length
              ? 0
              : undefined;
        if (!id || !storyId || !sceneId) return;
        setShow((prev) =>
          prev && prev.id === id
            ? {
                ...prev,
                storyId,
                sceneId,
                scenarioId,
                scenarioImageUrl,
                scenarioCrop,
                narrativeSlides,
                currentNarrativeIndex,
                sceneTitle,
                sceneBody,
                isNarrativeScene,
                storyScenes: storyScenes.length > 0 ? storyScenes : prev.storyScenes,
              }
            : prev
        );
        return;
      }
      if (msg.type === "show/narrative/slide") {
        const id = typeof msg.showId === "string" ? msg.showId : null;
        const index = typeof msg.index === "number" && Number.isFinite(msg.index) ? msg.index : 0;
        if (!id) return;
        setShow((prev) =>
          prev && prev.id === id ? { ...prev, currentNarrativeIndex: index } : prev
        );
        return;
      }
      if (topic && topic !== "espetaculo") return;
      if (msg.type === "show/scenario") {
        const id = typeof msg.showId === "string" ? msg.showId : null;
        const scenarioImageUrl =
          msg.scenarioImageUrl == null
            ? null
            : typeof msg.scenarioImageUrl === "string"
              ? msg.scenarioImageUrl
              : null;
        const raw = msg.scenarioCrop;
        const scenarioCrop =
          raw &&
          typeof raw === "object" &&
          typeof (raw as any).x === "number" &&
          typeof (raw as any).y === "number" &&
          typeof (raw as any).width === "number" &&
          typeof (raw as any).height === "number" &&
          (raw as any).width > 0 &&
          (raw as any).height > 0
            ? { x: (raw as any).x, y: (raw as any).y, width: (raw as any).width, height: (raw as any).height }
            : null;
        if (!id) return;
        setShow((prev) => (prev && prev.id === id ? { ...prev, scenarioImageUrl, scenarioCrop } : prev));
      } else if (msg.type === "show/cancel") {
        const id = typeof msg.showId === "string" ? msg.showId : null;
        if (!id) return;
        setShow((prev) => (prev?.id === id ? null : prev));
      }
    };
    liveKitRoom.on(RoomEvent.DataReceived, onDataReceived);

    const attachRemoteAudio = (track: import("livekit-client").RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return;
      const el = track.attach();
      el.setAttribute("aria-hidden", "true");
      el.style.position = "absolute";
      el.style.left = "-9999px";
      el.style.width = "0";
      el.style.height = "0";
      document.body.appendChild(el);
    };
    const onTrackSubscribed = (
      track: import("livekit-client").RemoteTrack,
      _publication: import("livekit-client").RemoteTrackPublication,
      _participant: import("livekit-client").RemoteParticipant
    ) => attachRemoteAudio(track);
    liveKitRoom.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    liveKitRoom.remoteParticipants.forEach((p) => {
      p.audioTrackPublications.forEach((pub) => {
        if (pub.track) attachRemoteAudio(pub.track);
      });
    });

    const updateSpeaking = (identity: string, speaking: boolean) => {
      setSpeakingByIdentity((prev) => (prev[identity] === speaking ? prev : { ...prev, [identity]: speaking }));
    };
    const onLocalSpeaking = () => {
      const v = liveKitRoom.localParticipant.isSpeaking;
      setLocalSpeaking(v);
      updateSpeaking(liveKitRoom.localParticipant.identity, v);
    };
    liveKitRoom.localParticipant.on(ParticipantEvent.IsSpeakingChanged, onLocalSpeaking);
    onLocalSpeaking();

    const unsubs: (() => void)[] = [];
    const subscribeSpeaking = (p: Participant) => {
      const handler = () => {
        const identity = p.identity;
        const speaking = p.isSpeaking;
        updateSpeaking(identity, speaking);
      };
      p.on(ParticipantEvent.IsSpeakingChanged, handler);
      handler();
      unsubs.push(() => p.off(ParticipantEvent.IsSpeakingChanged, handler));
    };
    liveKitRoom.remoteParticipants.forEach(subscribeSpeaking);
    const onParticipantConnected = (p: Participant) => subscribeSpeaking(p);
    liveKitRoom.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    /* Resiliência: não alteramos show ao desconectar (ex.: mestre); jogadores mantêm cenário, personagens e posições. */
    const onParticipantDisconnected = (p: Participant) => {
      setSpeakingByIdentity((prev) => {
        const next = { ...prev };
        delete next[p.identity];
        return next;
      });
    };
    liveKitRoom.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);

    return () => {
      liveKitRoom.off(RoomEvent.DataReceived, onDataReceived);
      liveKitRoom.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
      liveKitRoom.localParticipant.off(ParticipantEvent.IsSpeakingChanged, onLocalSpeaking);
      liveKitRoom.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      liveKitRoom.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
      unsubs.forEach((u) => u());
    };
  }, [liveKitRoom, isGM]);

  useEffect(() => {
    if (!logged && liveKitRoom) {
      liveKitRoom.disconnect();
      setLiveKitRoom(null);
    }
  }, [logged, liveKitRoom]);

  const isLobbyView = view === "LOBBY";
  const localIdentity = user ? `player-${user.id}` : null;
  useEffect(() => {
    if (!user) return;
    if (expressionTargetId == null) {
      expressionInitializedFromLobbyRef.current = false;
      return;
    }
    const me = isGM
      ? lobbyParticipants.find((p) => p.is_gm)
      : localIdentity
        ? lobbyParticipants.find((p) => p.identity === localIdentity)
        : undefined;
    if (me?.expression_slot != null && typeof me.expression_slot === "number" && !expressionInitializedFromLobbyRef.current) {
      expressionInitializedFromLobbyRef.current = true;
      setCurrentExpressionSlot(me.expression_slot >= 0 && me.expression_slot <= 9 ? me.expression_slot : 0);
    }
  }, [lobbyParticipants, localIdentity, user, expressionTargetId, isGM]);
  useEffect(() => {
    expressionInitializedFromLobbyRef.current = false;
  }, [expressionTargetId]);

  useEffect(() => {
    if (isGM) return;
    const cid = selectedCharacter?.id ?? null;
    if (cid == null) {
      setLocalCharacterImageBySlot({});
      return;
    }
    let cancelled = false;
    api<Array<{ slot: number; storage_key: string; created_at?: string | null }>>(`/api/me/characters/${cid}/images`)
      .then((list) => {
        if (cancelled || !Array.isArray(list)) return;
        const map: Record<number, string> = {};
        for (const row of list) {
          const sk = (row.storage_key ?? "").replace(/^\/+/, "");
          if (!sk) continue;
          const base = `/api/uploads/${sk}`;
          const rev = row.created_at ?? undefined;
          map[row.slot] = rev ? `${base}?rev=${rev}` : base;
        }
        setLocalCharacterImageBySlot(map);
      })
      .catch(() => {
        if (!cancelled) setLocalCharacterImageBySlot({});
      });
    return () => {
      cancelled = true;
    };
  }, [isGM, selectedCharacter?.id]);

  useEffect(() => {
    if (!isGM || show == null || (showPhase !== "half" && showPhase !== "stage")) {
      setGmStageSlotImagesBy({});
      return;
    }
    if (gmExpressionCharacterIds.length === 0) {
      setGmStageSlotImagesBy({});
      return;
    }
    let cancelled = false;
    Promise.all(
      gmExpressionCharacterIds.map((id) =>
        api<Array<{ slot: number; storage_key: string; created_at?: string | null }>>(`/api/gm/characters/${id}/images`)
          .then((list) => ({ id, list: Array.isArray(list) ? list : [] }))
          .catch(() => ({ id, list: [] as Array<{ slot: number; storage_key: string; created_at?: string | null }> }))
      )
    ).then((results) => {
      if (cancelled) return;
      const next: Record<number, Record<number, string>> = {};
      for (const { id, list } of results) {
        const map: Record<number, string> = {};
        for (const row of list) {
          const sk = (row.storage_key ?? "").replace(/^\/+/, "");
          if (!sk) continue;
          const base = `/api/uploads/${sk}`;
          const rev = row.created_at ?? undefined;
          map[row.slot] = rev ? `${base}?rev=${rev}` : base;
        }
        next[id] = map;
      }
      setGmStageSlotImagesBy(next);
    });
    return () => {
      cancelled = true;
    };
  }, [isGM, show, showPhase, gmExpressionCharacterIdsKey]);

  useEffect(() => {
    if (!show || !improvisationMode || !isGM) {
      setImprovisationScenarios([]);
      setImprovisationCharacters([]);
      return;
    }
    let cancelled = false;
    type ScenarioForImprov = {
      id: string;
      name: string;
      description?: string | null;
      image_storage_key: string | null;
      crop_x?: number | null;
      crop_y?: number | null;
      crop_width?: number | null;
      crop_height?: number | null;
    };
    Promise.all([
      api<ScenarioForImprov[]>(`/api/gm/scenarios`),
      api<GMCharacter[]>("/api/gm/characters"),
    ])
      .then(([scenariosRes, gmCharsRes]) => {
        if (cancelled) return;
        const scenarios = Array.isArray(scenariosRes) ? scenariosRes : [];
        setImprovisationScenarios(scenarios);
        const gmChars = Array.isArray(gmCharsRes) ? gmCharsRes : [];
        setImprovisationCharacters(gmChars);
      })
      .catch(() => {
        if (!cancelled) {
          setImprovisationScenarios([]);
          setImprovisationCharacters([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [show?.id, show?.storyId, improvisationMode, isGM]);

  useEffect(() => {
    if (!show?.scenarioId || !isGM) {
      setImprovisationScenarioId(show?.scenarioId ?? null);
      setImprovisationScenarioDescription("");
      return;
    }
    let cancelled = false;
    api<{ id: string; description?: string | null }>(`/api/gm/scenarios/${show.scenarioId}`)
      .then((sc) => {
        if (!cancelled) {
          setImprovisationScenarioId(sc.id);
          setImprovisationScenarioDescription(sc.description?.trim() ?? "");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImprovisationScenarioId(show.scenarioId);
          setImprovisationScenarioDescription("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [show?.scenarioId, show?.id, isGM]);

  const fetchLobby = useCallback(() => {
    if (!user) return;
    api<{ participants: LobbyParticipant[] }>("/api/lobby")
      .then((res) => setLobbyParticipants(res.participants ?? []))
      .catch(() => {});
  }, [user]);

  const gmHasShowActive = isGM && !!show;
  useEffect(() => {
    if (!user) return;
    if (!isLobbyView && !gmHasShowActive) return;
    fetchLobby();
    const intervalMs = 2000;
    const t = setInterval(fetchLobby, intervalMs);
    return () => clearInterval(t);
  }, [isLobbyView, gmHasShowActive, user, fetchLobby]);

  useEffect(() => {
    const gmEspHeartbeat =
      isGM &&
      !!show &&
      (showPhase === "half" || showPhase === "stage") &&
      gmExpressionTargets.length > 0;
    if ((!isLobbyView && !gmEspHeartbeat) || !user) return;
    const heartbeat = () => {
      const character_id = isLobbyView
        ? isGM
          ? null
          : selectedCharacter?.id ?? null
        : expressionTargetId;
      api("/api/lobby/me", {
        method: "POST",
        body: JSON.stringify({
          character_id,
          expression_slot: currentExpressionSlot,
        }),
      })
        .then(() => fetchLobby())
        .catch(() => {});
    };
    heartbeat();
    const t = setInterval(heartbeat, 25000);
    return () => clearInterval(t);
  }, [
    isLobbyView,
    isGM,
    show,
    showPhase,
    user,
    selectedCharacter?.id,
    expressionTargetId,
    gmExpressionTargets.length,
    currentExpressionSlot,
    fetchLobby,
  ]);

  /** Identity estável do utilizador no lobby (mesmo antes do LiveKit ligar). */
  const resolveLobbyExpressionIdentity = useCallback((): string | null => {
    const fromLk = liveKitRoom?.localParticipant?.identity;
    if (fromLk) return fromLk;
    if (!user) return null;
    return isGM ? "gm" : `player-${user.id}`;
  }, [liveKitRoom, user, isGM]);

  /** Durante o espetáculo o mestre também publica em `espetaculo` para os jogadores receberem como o resto do show. */
  const publishExpressionPayload = useCallback(
    (payload: Record<string, unknown>) => {
      const enc = new TextEncoder().encode(JSON.stringify(payload));
      const lp = liveKitRoom?.localParticipant;
      if (!lp) return;
      const dualTopic = isGM && show != null && (showPhase === "half" || showPhase === "stage");
      try {
        lp.publishData(enc, { reliable: true, topic: "lobby" });
        if (dualTopic) lp.publishData(enc, { reliable: true, topic: "espetaculo" });
      } catch {}
    },
    [liveKitRoom, isGM, show, showPhase]
  );

  const fixExpressionAndSync = useCallback(
    (slot: number) => {
      setCurrentExpressionSlot(slot);
      setTemporaryOverride(null);
      expressionKeyDownRef.current = null;
      if (expressionTimerRef.current) {
        clearTimeout(expressionTimerRef.current);
        expressionTimerRef.current = null;
      }
      const identity = resolveLobbyExpressionIdentity();
      api("/api/lobby/me", {
        method: "POST",
        body: JSON.stringify({
          character_id: expressionTargetId,
          expression_slot: slot,
        }),
      })
        .then(() => fetchLobby())
        .catch(() => {});
      if (identity && liveKitRoom?.localParticipant) {
        const ids = isGM && gmExpressionCharacterIds.length > 0 ? gmExpressionCharacterIds : null;
        const body: Record<string, unknown> = {
          type: "expression/current",
          identity,
          expression_slot: slot,
        };
        if (ids != null && ids.length > 0) {
          body.characterIds = ids;
          const { displayParticipants: dp, gmStageSlotImagesBy: slotBy, gmExpressionTargets: targets } =
            expressionPublishContextRef.current;
          body.portraitUrlByCharacterId = urlsForExpressionAtSlot(ids, slot, slotBy, targets, dp);
        } else if (expressionTargetId != null) body.characterId = expressionTargetId;
        publishExpressionPayload(body);
      }
    },
    [
      liveKitRoom,
      expressionTargetId,
      gmExpressionCharacterIds,
      isGM,
      fetchLobby,
      resolveLobbyExpressionIdentity,
      publishExpressionPayload,
    ]
  );

  const expressionKeysActive =
    isLobbyView ||
    (!!show &&
      (showPhase === "half" || showPhase === "stage") &&
      (effectiveRole === "PLAYER" || (isGM && gmExpressionTargets.length > 0)));
  useEffect(() => {
    if (!expressionKeysActive || !user) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
      const key = e.key;
      if (key.length !== 1 || key < "0" || key > "9") return;
      if (e.repeat) return;
      const keyNum = parseInt(key, 10);
      const slot = (keyNum + 9) % 10;
      const now = Date.now();
      const until = now + EXPRESSION_LOBBY_PREVIEW_MS;
      expressionKeyDownRef.current = { key, slot, time: now };
      setTemporaryOverride({ slot, until });
      try {
        const identity = resolveLobbyExpressionIdentity();
        if (identity && liveKitRoom?.localParticipant) {
          const ids = isGM && gmExpressionCharacterIds.length > 0 ? gmExpressionCharacterIds : null;
          const body: Record<string, unknown> = {
            type: "expression/override",
            identity,
            slot,
            until,
          };
          if (ids != null && ids.length > 0) {
            body.characterIds = ids;
            const { displayParticipants: dp, gmStageSlotImagesBy: slotBy, gmExpressionTargets: targets } =
              expressionPublishContextRef.current;
            body.previewUrlByCharacterId = urlsForExpressionAtSlot(ids, slot, slotBy, targets, dp);
          } else if (expressionTargetId != null) body.characterId = expressionTargetId;
          publishExpressionPayload(body);
        }
      } catch {}
      if (expressionTimerRef.current) clearTimeout(expressionTimerRef.current);
      expressionTimerRef.current = setTimeout(() => {
        expressionTimerRef.current = null;
        const ref = expressionKeyDownRef.current;
        if (ref?.key === key) {
          fixExpressionAndSync(slot);
        } else {
          setTemporaryOverride(null);
        }
      }, EXPRESSION_LOBBY_PREVIEW_MS);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key;
      if (key.length !== 1 || key < "0" || key > "9") return;
      const ref = expressionKeyDownRef.current;
      if (ref?.key === key) {
        const slot = ref.slot;
        if (Date.now() - ref.time >= EXPRESSION_LOBBY_PREVIEW_MS) {
          fixExpressionAndSync(slot);
        }
        expressionKeyDownRef.current = null;
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
    };
  }, [
    expressionKeysActive,
    user,
    fixExpressionAndSync,
    liveKitRoom,
    resolveLobbyExpressionIdentity,
    expressionTargetId,
    gmExpressionCharacterIds,
    isGM,
    publishExpressionPayload,
  ]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = actorDragRef.current;
      if (!r) return;
      const dx = e.clientX - r.startX;
      setActorOffsets((prev) => ({ ...prev, [r.identity]: r.startOffset + dx }));
    };
    const onUp = () => {
      actorDragRef.current = null;
    };
    window.addEventListener("mousemove", onMove, { capture: true });
    window.addEventListener("mouseup", onUp, { capture: true });
    return () => {
      window.removeEventListener("mousemove", onMove, { capture: true });
      window.removeEventListener("mouseup", onUp, { capture: true });
    };
  }, []);

  /* Cortina: fechada até a sequência; um segundo após o countdown = half (todos); mais um segundo = stage (cortina e valance saem). */
  const shouldOpenCurtains = showPhase === "half" || showPhase === "stage";
  const isGMView =
    isGM &&
    ["GM_HOME", "GM_CHARACTERS", "GM_SCENARIOS", "GM_STORIES", "GM_STORY_EDITOR", "GM_ESPETACULO"].includes(
      view
    );
  /* No espetáculo com show ativo, a valance deve aparecer e só sair na fase stage; nas outras telas GM, esconder valance. */
  const hideValance =
    isGMView &&
    (view !== "GM_ESPETACULO" || !show) &&
    (shouldOpenCurtains ||
      view === "GM_STORIES" ||
      view === "GM_CHARACTERS" ||
      view === "GM_SCENARIOS" ||
      view === "GM_STORY_EDITOR");

  const gmInRoom =
    liveKitRoom &&
    (liveKitRoom.localParticipant.identity === "gm" ||
      [...liveKitRoom.remoteParticipants.values()].some((p) => p.identity === "gm"));

  const baseParticipants: LobbyParticipant[] =
    lobbyParticipants.length > 0
      ? lobbyParticipants
      : view === "LOBBY" && user
        ? [
            ...(isGM || gmInRoom
              ? [{ user_id: isGM ? user!.id : 0, identity: "gm", is_gm: true, character_id: null, character_name: null, character_image_url: null, user_email: null, user_name: null }]
              : []),
            ...(!isGM
              ? [
                  {
                    user_id: user!.id,
                    identity: `player-${user!.id}`,
                    is_gm: false,
                    character_id: selectedCharacter?.id ?? null,
                    character_name: selectedCharacter?.name ?? null,
                    character_image_url: selectedCharacter?.imageUrl ?? null,
                    user_email: user?.email ?? null,
                    user_name: displayNameForUser || null,
                  },
                ]
              : []),
          ]
        : [];
  // Garantir que o mestre apareça sempre na visão do lobby quando o usuário é GM (evita sumir com atraso/API vazia).
  let displayParticipants: LobbyParticipant[] =
    view === "LOBBY" && user && isGM && !baseParticipants.some((p) => p.is_gm)
      ? [{ user_id: user.id, identity: "gm", is_gm: true, character_id: null, character_name: null, character_image_url: null, user_email: null, user_name: null }, ...baseParticipants]
      : baseParticipants;

  // Garantir que o jogador atual apareça sempre no lobby (com ou sem personagem), mesmo antes da API/LiveKit devolverem sua entrada.
  if (view === "LOBBY" && user && !isGM && !displayParticipants.some((p) => p.identity === `player-${user.id}`)) {
    displayParticipants = [
      ...displayParticipants,
      {
        user_id: user.id,
        identity: `player-${user.id}`,
        is_gm: false,
        character_id: selectedCharacter?.id ?? null,
        character_name: selectedCharacter?.name ?? null,
        character_image_url: selectedCharacter?.imageUrl ?? null,
        user_email: user.email ?? null,
        user_name: displayNameForUser || null,
      },
    ];
  }

  expressionPublishContextRef.current = {
    displayParticipants,
    gmStageSlotImagesBy,
    gmExpressionTargets,
  };

  /** Slot efetivo + URL por personagem. Preview 0–9 ≈1s = troca de imagem (override), não efeito CSS. */
  const resolvedParticipantImageByCharacterId = useMemo(() => {
    const now = Date.now();
    const map: Record<number, string> = {};
    const defaultImg = "/assets/jogador_default.png";
    const gmEspExpression =
      isGM &&
      !!show &&
      (showPhase === "half" || showPhase === "stage") &&
      gmExpressionCharacterIds.length > 0;

    const effectiveSlotFor = (characterId: number, identity: string, lobbySlot: number | null | undefined) => {
      const gmDrivingThis = gmEspExpression && gmExpressionCharacterIds.includes(characterId);
      const playerIsThisRow = !isGM && localIdentity != null && identity === localIdentity;
      const localPreviewActive =
        temporaryOverride &&
        now < temporaryOverride.until &&
        (playerIsThisRow || gmDrivingThis);
      const localPreviewSlot = localPreviewActive ? temporaryOverride!.slot : null;

      const cOv = expressionOverrideByCharacterId[characterId];
      const charPreview = cOv && now < cOv.until ? cOv.slot : null;
      const iOv = expressionOverrideByIdentity[identity];
      const idPreview = iOv && now < iOv.until ? iOv.slot : null;

      const fixedSlot =
        expressionCurrentByCharacterId[characterId] ??
        expressionCurrentByIdentity[identity] ??
        (typeof lobbySlot === "number" ? lobbySlot : undefined) ??
        0;

      return localPreviewSlot ?? charPreview ?? idPreview ?? fixedSlot;
    };

    for (const p of displayParticipants) {
      if (p.is_gm || p.character_id == null) continue;
      const cid = p.character_id;
      const cOvPrev = expressionOverrideByCharacterId[cid];
      if (cOvPrev && now < cOvPrev.until && typeof cOvPrev.previewUrl === "string" && cOvPrev.previewUrl !== "") {
        map[cid] = cOvPrev.previewUrl;
        continue;
      }
      const effectiveSlot = effectiveSlotFor(cid, p.identity, p.expression_slot);
      const gmDrivingThis =
        gmEspExpression && gmExpressionCharacterIds.includes(cid);
      const playerIsThisRow = !isGM && localIdentity != null && p.identity === localIdentity;
      const fromLobby = p.character_image_by_slot;
      const hasLobbySlots =
        fromLobby != null && typeof fromLobby === "object" && Object.keys(fromLobby).length > 0;
      const gmSlots = gmStageSlotImagesBy[cid];
      const hasGmSlots = gmSlots != null && typeof gmSlots === "object" && Object.keys(gmSlots).length > 0;
      /* Com vários alvos, o mestre carrega slot→URL para todos; o lobby por jogador pode vir incompleto e
       * esconder o "piscar" (sempre cai no slot 0). Preferir sempre o atlas carregado pelo mestre. */
      const slotMap =
        gmDrivingThis && hasGmSlots
          ? gmSlots
          : hasLobbySlots
            ? fromLobby
            : playerIsThisRow && Object.keys(localCharacterImageBySlot).length > 0
              ? localCharacterImageBySlot
              : undefined;
      let url =
        slotMap != null && slotMap[effectiveSlot] != null
          ? slotMap[effectiveSlot]
          : slotMap != null && slotMap[0] != null
            ? slotMap[0]
            : (p.character_image_url || defaultImg);
      const remoteFixed = expressionRemotePortraitByCharacterId[cid];
      if (remoteFixed && expressionCurrentByCharacterId[cid] != null) {
        const inRemotePreview = cOvPrev && now < cOvPrev.until;
        if (!inRemotePreview) url = remoteFixed;
      }
      map[cid] = url;
    }

    for (const t of gmExpressionTargets) {
      if (displayParticipants.some((q) => !q.is_gm && q.character_id === t.id)) continue;
      if (!gmEspExpression) continue;
      const cid = t.id;
      const cOvPrev = expressionOverrideByCharacterId[cid];
      if (cOvPrev && now < cOvPrev.until && typeof cOvPrev.previewUrl === "string" && cOvPrev.previewUrl !== "") {
        map[cid] = cOvPrev.previewUrl;
        continue;
      }
      const effectiveSlot = effectiveSlotFor(cid, "", undefined);
      const gmSlots = gmStageSlotImagesBy[cid];
      const slotMap =
        gmSlots != null && Object.keys(gmSlots).length > 0 ? gmSlots : undefined;
      let url =
        slotMap != null && slotMap[effectiveSlot] != null
          ? slotMap[effectiveSlot]
          : slotMap != null && slotMap[0] != null
            ? slotMap[0]
            : (t.imageUrl || defaultImg);
      const remoteFixed = expressionRemotePortraitByCharacterId[cid];
      if (remoteFixed && expressionCurrentByCharacterId[cid] != null) {
        const inRemotePreview = cOvPrev && now < cOvPrev.until;
        if (!inRemotePreview) url = remoteFixed;
      }
      map[cid] = url;
    }

    /* Jogadores: ids no palco podem não ter linha no GET /lobby (NPC, atraso na lista). O mapa só iterava
     * `displayParticipants`, logo `resolvedParticipantImageByCharacterId[id]` ficava vazio e o StageView usava
     * só `c.imageUrl` estático — ignorando o que veio do mestre. Aplicar URLs do LiveKit a *todos* os ids. */
    for (const cidRaw of Object.keys(expressionOverrideByCharacterId)) {
      const cid = Number(cidRaw);
      if (!Number.isFinite(cid)) continue;
      const cOv = expressionOverrideByCharacterId[cid];
      if (cOv && now < cOv.until && typeof cOv.previewUrl === "string" && cOv.previewUrl !== "") {
        map[cid] = cOv.previewUrl;
      }
    }
    for (const cidRaw of Object.keys(expressionRemotePortraitByCharacterId)) {
      const cid = Number(cidRaw);
      if (!Number.isFinite(cid)) continue;
      const cOv = expressionOverrideByCharacterId[cid];
      if (cOv && now < cOv.until && typeof cOv.previewUrl === "string" && cOv.previewUrl !== "") continue;
      const rem = expressionRemotePortraitByCharacterId[cid];
      if (rem != null && rem !== "" && expressionCurrentByCharacterId[cid] != null) {
        map[cid] = rem;
      }
    }

    return map;
  }, [
    displayParticipants,
    localIdentity,
    currentExpressionSlot,
    temporaryOverride,
    expressionOverrideByIdentity,
    expressionCurrentByIdentity,
    expressionOverrideByCharacterId,
    expressionRemotePortraitByCharacterId,
    expressionCurrentByCharacterId,
    localCharacterImageBySlot,
    gmStageSlotImagesBy,
    gmExpressionTargets,
    gmExpressionCharacterIds,
    isGM,
    show,
    showPhase,
    showTick,
  ]);

  const publishShowPayload = useCallback(
    (type: "show/start" | "show/scene/change", showId: string, startedAt: number, sceneState: ShowSceneState) => {
      try {
        liveKitRoom?.localParticipant.publishData(
          new TextEncoder().encode(
            JSON.stringify({
              type,
              showId,
              startedAt,
              storyId: sceneState.storyId,
              sceneId: sceneState.sceneId,
              scenarioId: sceneState.scenarioId,
              scenarioImageUrl: sceneState.scenarioImageUrl,
              scenarioCrop: sceneState.scenarioCrop,
              narrativeSlides: sceneState.narrativeSlides,
              currentNarrativeIndex: sceneState.currentNarrativeIndex,
              sceneTitle: sceneState.sceneTitle,
              sceneBody: sceneState.sceneBody,
              isNarrativeScene: sceneState.isNarrativeScene,
              storyScenes: sceneState.storyScenes,
            })
          ),
          { reliable: true, topic: "espetaculo" }
        );
      } catch {}
    },
    [liveKitRoom]
  );

  const handleStartShow = useCallback(
    async (storyId: string, sceneId: string) => {
      const startedAt = Date.now();
      const id = String(startedAt);
      const sceneState = await buildShowSceneState(storyId, sceneId);
      setShow({
        id,
        startedAt,
        ...sceneState,
      });
      publishShowPayload("show/start", id, startedAt, sceneState);
      try {
        await api("/api/show/start", {
          method: "POST",
          body: JSON.stringify({
            showId: id,
            startedAt,
            ...sceneState,
          }),
        });
      } catch {}
      if (sceneState.narrativeSlides?.length) {
        try {
          liveKitRoom?.localParticipant.publishData(
            new TextEncoder().encode(JSON.stringify({ type: "show/narrative/slide", showId: id, index: 0 })),
            { reliable: true, topic: "espetaculo" }
          );
        } catch {}
      }
    },
    [buildShowSceneState, liveKitRoom, publishShowPayload]
  );

  const handleChangeShowScene = useCallback(
    async (sceneId: string) => {
      if (!show || showSceneSwitching || sceneId === show.sceneId) return;
      setShowSceneSwitching(true);
      try {
        const sceneState = await buildShowSceneState(show.storyId, sceneId);
        setShow((prev) =>
          prev && prev.id === show.id
            ? {
                ...prev,
                ...sceneState,
              }
            : prev
        );
        publishShowPayload("show/scene/change", show.id, show.startedAt, sceneState);
        try {
          await api("/api/show/active", {
            method: "PATCH",
            body: JSON.stringify({
              sceneId: sceneState.sceneId,
              scenarioId: sceneState.scenarioId,
              scenarioImageUrl: sceneState.scenarioImageUrl,
              scenarioCrop: sceneState.scenarioCrop,
              narrativeSlides: sceneState.narrativeSlides,
              currentNarrativeIndex: sceneState.currentNarrativeIndex,
              sceneTitle: sceneState.sceneTitle,
              sceneBody: sceneState.sceneBody,
              isNarrativeScene: sceneState.isNarrativeScene,
            }),
          });
        } catch {}
        if (sceneState.narrativeSlides?.length) {
          try {
            liveKitRoom?.localParticipant.publishData(
              new TextEncoder().encode(JSON.stringify({ type: "show/narrative/slide", showId: show.id, index: 0 })),
              { reliable: true, topic: "espetaculo" }
            );
          } catch {}
        }
      } finally {
        setShowSceneSwitching(false);
      }
    },
    [buildShowSceneState, liveKitRoom, publishShowPayload, show, showSceneSwitching]
  );

  const handlePreviewHover = useCallback(
    async (sceneId: string) => {
      if (!show || previewBySceneId[sceneId] || previewLoadingSceneId === sceneId) return;
      setPreviewLoadingSceneId(sceneId);
      try {
        const preview = await loadScenePreview(show.storyId, sceneId);
        setPreviewBySceneId((prev) => ({ ...prev, [sceneId]: preview }));
      } catch {
        setPreviewBySceneId((prev) => ({ ...prev, [sceneId]: undefined }));
      } finally {
        setPreviewLoadingSceneId((current) => (current === sceneId ? null : current));
      }
    },
    [loadScenePreview, previewBySceneId, previewLoadingSceneId, show]
  );

  const handleSaveSceneInfo = useCallback(async () => {
    if (!show) return;
    setSceneInfoSaving(true);
    try {
      const updated = await api<ShowSceneRecord>(`/api/gm/stories/${show.storyId}/scenes/${show.sceneId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: sceneInfoDraft.title,
          body: sceneInfoDraft.body,
        }),
      });
      setShow((prev) =>
        prev && prev.id === show.id
          ? {
              ...prev,
              sceneTitle: updated.title,
              sceneBody: updated.body,
              storyScenes: prev.storyScenes.map((scene) =>
                scene.id === updated.id ? { ...scene, title: updated.title } : scene
              ),
            }
          : prev
      );
    } finally {
      setSceneInfoSaving(false);
    }
  }, [sceneInfoDraft.body, sceneInfoDraft.title, show]);

  const handleSaveSceneAsNew = useCallback(async () => {
    if (!show) return;
    setSceneSaveAsNewSaving(true);
    try {
      const scenarioId = show.scenarioId ?? improvisationScenarioId;
      const created = await api<ShowSceneRecord>(`/api/gm/stories/${show.storyId}/scenes`, {
        method: "POST",
        body: JSON.stringify({
          title: "Improviso",
          body: improvisationScenarioDescription.trim() || show.sceneBody || "",
          order_index: show.storyScenes.length,
          is_narrative: false,
          narrative_black_start: false,
          scenario_id: scenarioId,
        }),
      });
      setShow((prev) =>
        prev && prev.id === show.id
          ? {
              ...prev,
              storyScenes: [
                ...prev.storyScenes,
                { id: created.id, title: created.title, is_narrative: created.is_narrative },
              ],
            }
          : prev
      );
      await handleChangeShowScene(created.id);
    } finally {
      setSceneSaveAsNewSaving(false);
    }
  }, [show, improvisationScenarioId, improvisationScenarioDescription, handleChangeShowScene]);

  const hoveredPreview = previewHoverSceneId ? previewBySceneId[previewHoverSceneId] : undefined;
  const hoveredScene = show?.storyScenes.find((s) => s.id === previewHoverSceneId);

  const scheduleClosePreview = useCallback(() => {
    if (closePreviewTimeoutRef.current != null) window.clearTimeout(closePreviewTimeoutRef.current);
    closePreviewTimeoutRef.current = window.setTimeout(() => {
      setPreviewHoverSceneId(null);
      setPreviewCardRect(null);
      closePreviewTimeoutRef.current = null;
    }, 220);
  }, []);

  const cancelClosePreview = useCallback(() => {
    if (closePreviewTimeoutRef.current != null) {
      window.clearTimeout(closePreviewTimeoutRef.current);
      closePreviewTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!previewHoverSceneId || !previewTriggerRef.current) {
      setPreviewCardRect(null);
      return;
    }
    const el = previewTriggerRef.current;
    const update = () => setPreviewCardRect(el.getBoundingClientRect());
    update();
    const onScrollOrResize = () => update();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [previewHoverSceneId]);

  useEffect(() => {
    return () => {
      if (closePreviewTimeoutRef.current != null) window.clearTimeout(closePreviewTimeoutRef.current);
    };
  }, []);

  return (
    <StageLayout
      logged={logged}
      isGM={isGM}
      showBackstage={showBackstage}
      stageMode={stageMode}
      curtainsOpen={shouldOpenCurtains}
      hideValance={hideValance}
      espetaculoPhase={espetaculoPhase}
      centerOffForStage={
        !!(show && (showPhase === "half" || showPhase === "stage") && (isGM || selectedCharacter != null))
      }
      stageContent={
        show && (showPhase === "half" || showPhase === "stage") && (isGM || selectedCharacter != null) ? (
          <StageView
            room={liveKitRoom}
            showId={show.id}
            phase={showPhase}
            storyId={show.storyId}
            sceneId={show.sceneId}
            scenarioImageUrl={show.scenarioImageUrl}
            scenarioCrop={show.scenarioCrop ?? null}
            narrativeSlides={show.narrativeSlides}
            currentNarrativeIndex={show.currentNarrativeIndex ?? 0}
            onNarrativeIndexChange={(index) =>
              setShow((prev) => (prev ? { ...prev, currentNarrativeIndex: index } : prev))
            }
            initialStageState={show.stageState ?? undefined}
            isGM={isGM}
            gmEmail={user?.email ?? null}
            lobbyParticipants={displayParticipants}
            lobbyCharacterIdsKey={lobbyCharacterIdsKeyStable}
            speakingByIdentity={speakingByIdentity}
            playerExpressionSlot={!isGM || gmExpressionTargets.length > 0 ? currentExpressionSlot : undefined}
            resolvedParticipantImageByCharacterId={resolvedParticipantImageByCharacterId}
            improvisationMode={improvisationMode}
            isNarrativeScene={show.isNarrativeScene}
            improvisationScenarios={improvisationScenarios}
            improvisationCharacters={improvisationCharacters}
            playerCharacterId={isGM ? gmExpressionTargets[0]?.id ?? null : selectedCharacter?.id ?? null}
            onGmExpressionTargetsChange={onGmExpressionTargetsChange}
            onScenarioChange={({ scenarioImageUrl: url, scenarioCrop: crop, scenarioId: sid, scenarioDescription: desc }) => {
              setShow((prev) => (prev ? { ...prev, scenarioImageUrl: url, scenarioCrop: crop ?? null } : prev));
              if (sid != null) setImprovisationScenarioId(sid);
              if (desc != null) setImprovisationScenarioDescription(desc);
              try {
                liveKitRoom?.localParticipant.publishData(
                  new TextEncoder().encode(
                    JSON.stringify({
                      type: "show/scenario",
                      showId: show.id,
                      scenarioImageUrl: url,
                      scenarioCrop: crop ?? undefined,
                    })
                  ),
                  { reliable: true, topic: "espetaculo" }
                );
              } catch {}
            }}
            floatingMenuPos={floatingMenuPos}
            setFloatingMenuPos={setFloatingMenuPos}
            canSendSafetySignal={user?.role === "PLAYER"}
            safetySenderIdentity={user?.role === "PLAYER" && user ? `player-${user.id}` : null}
            safetyDisplayName={user?.role === "PLAYER" ? user.name : undefined}
            safetyEmail={user?.role === "PLAYER" ? user.email : undefined}
            safetyCharacterId={selectedCharacter?.id ?? null}
            safetyCharacterName={selectedCharacter?.name ?? null}
          />
        ) : null
      }
    >
      {showPhase === "countdown" &&
        createPortal(
          <div className="espetaculo-countdown-overlay" role="dialog" aria-live="polite">
            <div className="espetaculo-countdown-box">
              <p className="espetaculo-countdown-text">
                O jogo começará em <strong>{countdownSeconds}</strong> segundo{countdownSeconds !== 1 ? "s" : ""}.
              </p>
            </div>
          </div>,
          document.body
        )}
      {isGM &&
        show &&
        safetySignals.length > 0 &&
        createPortal(
          <div
            className="safety-signals-panel"
            role="region"
            aria-live="assertive"
            aria-label="Alerta: jogador pediu pausa ou ajuste na mesa"
          >
            <div className="safety-signals-panel__header">
              <div className="safety-signals-panel__title-row">
                <svg className="safety-signals-panel__alert-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                </svg>
                <div className="safety-signals-panel__title-text">
                  <span className="safety-signals-panel__title">Alerta na mesa</span>
                  <span className="safety-signals-panel__subtitle">Jogador sinalizou pausa ou desconforto — sem som</span>
                </div>
              </div>
              <button
                type="button"
                className="safety-signals-panel__btn safety-signals-panel__btn--clear"
                onClick={dismissAllSafetySignals}
              >
                Limpar todos
              </button>
            </div>
            <ul className="safety-signals-panel__list">
              {safetySignals.map((s) => {
                const who =
                  [s.displayName, s.email, s.identity].find((x) => x && String(x).trim() !== "") ?? s.identity;
                const charLine =
                  s.characterName && s.characterName.trim() !== ""
                    ? `Personagem: ${s.characterName.trim()}`
                    : s.characterId != null
                      ? `Personagem #${s.characterId}`
                      : null;
                const timeStr = new Date(s.at).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                });
                return (
                  <li key={s.id} className="safety-signals-panel__item">
                    <div className="safety-signals-panel__item-body">
                      <span className="safety-signals-panel__time">{timeStr}</span>
                      <span className="safety-signals-panel__who">{who}</span>
                      {charLine != null && (
                        <span className="safety-signals-panel__character">{charLine}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="safety-signals-panel__btn"
                      onClick={() => dismissSafetySignal(s.id)}
                      aria-label={`Dispensar alerta de ${who}`}
                    >
                      Dispensar
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body
        )}
      {isGM &&
        show &&
        createPortal(
          <>
            <div className="espetaculo-interrupt-wrap" aria-label="Controle do espetáculo">
              <button
                type="button"
                className="ui-btn ui-btn--ghost"
                onClick={async () => {
                  if (!show) return;
                  const msg = { type: "show/cancel", showId: show.id };
                  try {
                    liveKitRoom?.localParticipant.publishData(
                      new TextEncoder().encode(JSON.stringify(msg)),
                      { reliable: true, topic: "espetaculo" }
                    );
                  } catch {}
                  try {
                    await api("/api/show/cancel", { method: "POST" });
                  } catch {}
                  setShow(null);
                  setShowSceneMenuOpen(false);
                  setSceneInfoOpen(false);
                }}
              >
                Interromper o espetáculo
              </button>
            </div>

            <div className="show-gm-scene-controls">
              <div className="show-scene-info">
                <button
                  type="button"
                  className={"show-scene-info__trigger" + (sceneInfoOpen ? " is-active" : "")}
                  onClick={() => setSceneInfoOpen((open) => !open)}
                  aria-expanded={sceneInfoOpen}
                  aria-label={sceneInfoOpen ? "Fechar informações da cena" : "Abrir informações da cena"}
                  title="Informações da cena"
                >
                  i
                </button>
                {sceneInfoOpen && (
                  <div className="show-scene-info__panel">
                    <div className="show-scene-info__header">
                      <span className="show-scene-info__title">Cena atual</span>
                    </div>
                    <label className="show-scene-info__label">
                      <span>Título</span>
                      <input
                        className="ui-field"
                        value={sceneInfoDraft.title}
                        onChange={(e) => setSceneInfoDraft((prev) => ({ ...prev, title: e.target.value }))}
                      />
                    </label>
                    <label className="show-scene-info__label">
                      <span>Descrição</span>
                      <textarea
                        className="ui-field show-scene-info__textarea"
                        value={sceneInfoDraft.body}
                        onChange={(e) => setSceneInfoDraft((prev) => ({ ...prev, body: e.target.value }))}
                      />
                    </label>
                    <div className="show-scene-info__actions">
                      <button
                        type="button"
                        className="ui-btn ui-btn--ghost"
                        disabled={sceneInfoSaving}
                        onClick={() => setSceneInfoDraft({ title: show.sceneTitle, body: show.sceneBody })}
                      >
                        Desfazer
                      </button>
                      <button
                        type="button"
                        className="ui-btn"
                        disabled={sceneInfoSaving}
                        onClick={() => void handleSaveSceneInfo()}
                      >
                        {sceneInfoSaving ? "Salvando..." : "Salvar"}
                      </button>
                    </div>
                    {improvisationMode && (
                      <>
                        <div className="show-scene-info__header show-scene-info__header--improviso">
                          <span className="show-scene-info__title">Improviso</span>
                        </div>
                        <div className="show-scene-info__improviso-desc">
                          <textarea
                            className="ui-field show-scene-info__textarea"
                            readOnly
                            value={improvisationScenarioDescription || "—"}
                            aria-label="Texto do cenário (improviso)"
                          />
                        </div>
                        <div className="show-scene-info__actions">
                          <button
                            type="button"
                            className="ui-btn"
                            disabled={sceneSaveAsNewSaving}
                            onClick={() => void handleSaveSceneAsNew()}
                          >
                            {sceneSaveAsNewSaving ? "Salvando..." : "Salvar como nova cena"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="show-scene-menu">
                <button
                  type="button"
                  className="show-scene-menu__trigger"
                  onClick={() => setShowSceneMenuOpen((open) => !open)}
                  aria-expanded={showSceneMenuOpen}
                  aria-label={showSceneMenuOpen ? "Recolher menu de cenas" : "Abrir menu de cenas"}
                  title={showSceneMenuOpen ? "Recolher menu de cenas" : "Cenas"}
                >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M8 6h13" />
                  <path d="M8 12h13" />
                  <path d="M8 18h13" />
                  <path d="M3 6h.01" />
                  <path d="M3 12h.01" />
                  <path d="M3 18h.01" />
                </svg>
              </button>
              <div className={"show-scene-menu__panel" + (showSceneMenuOpen ? " show-scene-menu__panel--open" : "")}>
                <div className="show-scene-menu__drag-handle" title="Cenas">
                  <span className="show-scene-menu__drag-dots">⋯</span>
                  <span className="show-scene-menu__panel-title">Cenas</span>
                  <label className="show-scene-menu__improviso show-scene-menu__improviso--in-handle">
                    <input
                      type="checkbox"
                      checked={improvisationMode}
                      onChange={(e) => setImprovisationMode(e.target.checked)}
                      aria-label="Modo improviso"
                    />
                    <span className="show-scene-menu__improviso-label">Improviso</span>
                  </label>
                </div>
                <div className="show-scene-menu__body">
                  {show.storyScenes.map((scene) => (
                    <button
                      key={scene.id}
                      type="button"
                      className={
                        "show-scene-menu__item" +
                        (scene.id === show.sceneId ? " is-active" : "") +
                        (showSceneSwitching ? " is-busy" : "")
                      }
                      disabled={showSceneSwitching && scene.id !== show.sceneId}
                      onClick={() => handleChangeShowScene(scene.id)}
                    >
                      <span className="show-scene-menu__item-text">
                        <span className="show-scene-menu__item-title">{scene.title || "(sem título)"}</span>
                        <span className="show-scene-menu__item-sub">
                          {scene.is_narrative ? "Narrativa" : "Cena"}
                        </span>
                      </span>
                      <div
                        className="show-scene-menu__preview-wrap"
                        onMouseEnter={(e) => {
                          cancelClosePreview();
                          previewTriggerRef.current = e.currentTarget;
                          setPreviewHoverSceneId(scene.id);
                          void handlePreviewHover(scene.id);
                        }}
                        onMouseLeave={() => scheduleClosePreview()}
                      >
                        <span className="show-scene-menu__preview-icon" aria-hidden>
                          i
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {previewHoverSceneId && previewCardRect &&
              createPortal(
                <div
                  className="show-scene-menu__preview-card show-scene-menu__preview-card--portal"
                  style={{
                    left: previewCardRect.right + 10,
                    top: Math.max(8, previewCardRect.top + previewCardRect.height / 2 - 180),
                  }}
                  role="tooltip"
                  onMouseEnter={cancelClosePreview}
                  onMouseLeave={scheduleClosePreview}
                >
                  {previewLoadingSceneId === previewHoverSceneId && !hoveredPreview ? (
                    <span className="show-scene-menu__preview-empty">Carregando preview...</span>
                  ) : hoveredPreview ? (
                    <>
                      <span className="show-scene-menu__preview-title">
                        {hoveredScene?.title || "(sem título)"}
                      </span>
                      <div className="show-scene-menu__preview-stage">
                        {hoveredPreview.mode === "narrative" ? (
                          hoveredPreview.narrativePreviewSlide ? (
                            hoveredPreview.narrativePreviewSlide.isBlack ? (
                              <span className="show-scene-menu__preview-black" />
                            ) : (
                              <ScenarioBackground
                                imageUrl={hoveredPreview.narrativePreviewSlide.url}
                                crop={hoveredPreview.narrativePreviewSlide.crop ?? undefined}
                                className="show-scene-menu__preview-bg"
                              />
                            )
                          ) : (
                            <span className="show-scene-menu__preview-empty">Sem preview</span>
                          )
                        ) : (
                          <SceneStagePreview
                            scenarioImageUrl={hoveredPreview.scenarioImageUrl}
                            scenarioCrop={hoveredPreview.scenarioCrop}
                            sceneCharacterIds={hoveredPreview.sceneCharacterIds}
                            gmCharacters={showMenuCharacters}
                            gmEmail={user?.email ?? undefined}
                            variant="preview"
                          />
                        )}
                      </div>
                    </>
                  ) : (
                    <span className="show-scene-menu__preview-empty">Sem preview</span>
                  )}
                </div>,
                document.body
              )}
            </div>
          </>,
          document.body
        )}
      {logged && (
        <LobbyScreen
          room={liveKitRoom}
          isGM={isGM}
          selectedCharacter={selectedCharacter}
          lobbyParticipants={displayParticipants}
          onSelectCharacter={() => setSubView("SELECT_CHARACTER")}
          onCreateCharacter={() => {
            setStageMode("ZOOM_IN");
            setSubView("CREATE_CHARACTER");
          }}
          onRoomConnected={setLiveKitRoom}
          showMainUI={
            view === "LOBBY" &&
            !(effectiveRole === "PLAYER" && show && (showPhase === "half" || showPhase === "stage") && selectedCharacter != null)
          }
          showActiveMustSelectCharacter={
            effectiveRole === "PLAYER" && !!show && selectedCharacter == null
          }
          onEditProfile={effectiveRole === "PLAYER" ? () => setSubView("EDIT_PROFILE") : undefined}
          floatingMenuPos={floatingMenuPos}
          setFloatingMenuPos={setFloatingMenuPos}
          floatingMenuAudioOffsetBottom={isStageMenuUnified ? FLOATING_MENU_CHARACTER_BAR_HEIGHT : 0}
        />
      )}
      {loading ? (
        <Screen title="Carregando…" />
      ) : view === "LOGIN" ? (
        <LoginScreen />
      ) : view === "RESET" ? (
        <ForceResetScreen />
      ) : view === "GM_HOME" ? (
        <HomeGMScreen
          onRoteiro={() => setGmSubView("GM_STORIES")}
          onFigurinos={() => setGmSubView("GM_CHARACTERS")}
          onCenarios={() => setGmSubView("GM_SCENARIOS")}
          onLobby={() => setViewMode("PLAYER")}
          onEspetaculo={() => setGmSubView("GM_ESPETACULO")}
          onLogout={() => logout()}
        />
      ) : view === "GM_ESPETACULO" ? (
        show ? null : (
          <EspetaculoScreen
            onBack={() => setGmSubView("GM_HOME")}
            lobbyConnected={!!liveKitRoom}
            onEditScene={(storyId, sceneId) => {
              setEditingStoryId(storyId);
              setEditingSceneId(sceneId);
              setGmSubView("GM_STORY_EDITOR");
            }}
            onStartShow={(storyId, sceneId) => {
              void handleStartShow(storyId, sceneId);
            }}
          />
        )
      ) : view === "GM_STORIES" ? (
        <StoryListScreen
          onBack={() => setGmSubView("GM_HOME")}
          onOpenEditor={(storyId) => {
            setEditingStoryId(storyId);
            setGmSubView("GM_STORY_EDITOR");
          }}
        />
      ) : view === "GM_STORY_EDITOR" ? (
        editingStoryId ? (
          <StoryEditorScreen
            storyId={editingStoryId}
            initialSceneId={editingSceneId}
            onBack={() => {
              setGmSubView("GM_STORIES");
              setEditingStoryId(null);
              setEditingSceneId(null);
            }}
            onNavigateToCreateCharacter={() => {
              setEditingReturnGmView("GM_STORY_EDITOR");
              setEditingFromGM(true);
              setSubView("CREATE_CHARACTER");
            }}
            onNavigateToCreateScenario={() => {
              setReturnToStoryId(editingStoryId);
              setGmSubView("GM_SCENARIOS");
            }}
          />
        ) : (
          <div className="lobby-wrap">
            <div className="lobby-cabinet">
              <p style={{ margin: "0 0 1rem", opacity: 0.9 }}>Nenhuma história selecionada.</p>
              <button
                className="ui-btn ui-btn--ghost"
                type="button"
                onClick={() => setGmSubView("GM_STORIES")}
              >
                Voltar à lista
              </button>
            </div>
          </div>
        )
      ) : view === "GM_SCENARIOS" ? (
        <GMScenariosScreen
          onBack={() => {
            if (returnToStoryId != null) {
              setEditingStoryId(returnToStoryId);
              setGmSubView("GM_STORY_EDITOR");
              setReturnToStoryId(null);
            } else {
              setGmSubView("GM_HOME");
            }
          }}
        />
      ) : view === "GM_CHARACTERS" ? (
        <GMCharactersScreen
          onBack={() => setGmSubView("GM_HOME")}
          onEdit={(c) => {
            setEditingReturnGmView("GM_CHARACTERS");
            setEditingFromGM(true);
            setEditingCharacter({
              id: c.id,
              name: c.name,
              concept: c.concept ?? "",
              system: c.system ?? "",
              backstory: c.backstory ?? "",
              notes: c.notes ?? "",
              systems: c.systems,
            });
            setSubView("EDIT_CHARACTER");
          }}
          onCreate={() => {
            setCreateCharacterKind("PC");
            setEditingFromGM(true);
            setSubView("CREATE_CHARACTER");
          }}
          onCreateNpc={() => {
            setCreateCharacterKind("NPC");
            setEditingFromGM(true);
            setSubView("CREATE_CHARACTER");
          }}
        />
      ) : view === "CREATE_CHARACTER" ? (
        <CreateCharacterScreen
          scope={editingFromGM ? "GM" : "ME"}
          initialKind={editingFromGM ? createCharacterKind : undefined}
          onBack={() => {
            if (editingFromGM) {
              setSubView("LOBBY");
              setGmSubView(editingReturnGmView ?? "GM_CHARACTERS");
              setEditingReturnGmView(null);
              setEditingFromGM(false);
              setCreateCharacterKind("PC");
              return;
            }
            setSubView("LOBBY");
          }}
          onCreated={() => {
            if (editingFromGM) {
              setSubView("LOBBY");
              setGmSubView(editingReturnGmView ?? "GM_CHARACTERS");
              setEditingReturnGmView(null);
              setEditingFromGM(false);
              setCreateCharacterKind("PC");
            }
          }}
        />
      ) : view === "SELECT_CHARACTER" ? (
        <SelectCharacterScreen
          messageWhenShowActive={
            show && effectiveRole === "PLAYER"
              ? "A mesa já está em jogo nesta sessão. Escolha um personagem para entrar na mesma partida — não é apenas visitar o lobby."
              : undefined
          }
          onBack={() => setSubView("LOBBY")}
          onSelect={(c) => {
            setSelectedCharacter({
              id: c.id,
              name: c.name,
              system: c.system ?? "",
              imageUrl: getAvatarUrl(c),
            });
            setSubView("LOBBY");
          }}
          onEdit={(c) => {
            setEditingCharacter({
              id: c.id,
              name: c.name,
              concept: c.concept ?? "",
              system: c.system ?? "",
              backstory: c.backstory ?? "",
              notes: c.notes ?? "",
              systems: c.systems,
            });
            setSubView("EDIT_CHARACTER");
          }}
        />
      ) : view === "EDIT_CHARACTER" ? (
        <EditCharacterScreen
          scope={editingFromGM ? "GM" : "ME"}
          character={editingCharacter}
          onBack={() => {
            setEditingCharacter(null);
            if (editingFromGM) {
              setGmSubView(editingReturnGmView ?? "GM_CHARACTERS");
              setEditingReturnGmView(null);
              setEditingFromGM(false);
              setSubView("LOBBY");
              return;
            }
            setSubView("SELECT_CHARACTER");
          }}
        />
      ) : view === "EDIT_PROFILE" ? (
        <EditProfileScreen onBack={() => setSubView("LOBBY")} />
      ) : !(effectiveRole === "PLAYER" && show && (showPhase === "half" || showPhase === "stage")) ? (
          <div className="lobby-stage" aria-label="Jogadores no lobby">
            {displayParticipants.some((p) => p.is_gm) && (
              <img
                className={
                  "lobby-master" + ((speakingByIdentity["gm"] ?? false) ? " lobby-master--speaking" : "")
                }
                src="/assets/jogador_default.png"
                alt="Mestre"
                aria-label="Mestre"
              />
            )}
            <div className="lobby-actors" aria-label="Jogadores">
              {displayParticipants
                .filter((p) => !p.is_gm)
                .slice(0, 5)
                .map((p) => {
                  const imageUrl =
                    p.character_id != null && resolvedParticipantImageByCharacterId[p.character_id] != null
                      ? resolvedParticipantImageByCharacterId[p.character_id]
                      : (p.character_image_url || "/assets/jogador_default.png");
                  const isSpeaking = liveKitRoom
                    ? p.identity === liveKitRoom.localParticipant.identity
                      ? localSpeaking
                      : (speakingByIdentity[p.identity] ?? false)
                    : false;
                  const offset = actorOffsets[p.identity] ?? 0;
                  const displayLabel = (p.user_name ?? p.user_email ?? "").trim() || null;
                  const altText =
                    p.character_name != null && p.character_name !== ""
                      ? p.character_name
                      : (displayLabel ? `${displayLabel} (se arrumando)` : "(se arrumando)");
                  return (
                    <div
                      key={p.user_id}
                      className="lobby-actor-wrap"
                      style={{ transform: `translateX(${offset}px)` }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        actorDragRef.current = {
                          identity: p.identity,
                          startX: e.clientX,
                          startOffset: offset,
                        };
                      }}
                    >
                      <img
                        key={`lobby-actor-${p.identity}-${imageUrl}`}
                        className={"lobby-actor" + (isSpeaking ? " lobby-actor--speaking" : "")}
                        src={imageUrl}
                        alt={altText}
                        draggable={false}
                      />
                    </div>
                  );
                })}
            </div>
          </div>
      ) : null}
    </StageLayout>
  );
}