import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  rectIntersection,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { api } from "../api";
import { RoomEvent, type Room } from "livekit-client";
import type { LobbyParticipant } from "./LobbyScreen";
import { ScenarioBackground } from "./SceneStagePreview";
import { createPortal } from "react-dom";
import {
  StageCharacterBar,
  StageBookPanel,
  StageFichaPanel,
  StageStatusPanel,
  StageInventoryPanel,
  AbilityCardOverlay,
} from "./StageCharacterPanels";
import type { GMCharacter } from "../types/character";
import { getAvatarUrl } from "../utils/avatar";
import { scenarioCropFromScenario, scenarioImageUrl as getScenarioImageUrlFromScenario } from "../scenarioCrop";

type SceneCharactersOut = { character_ids: number[] };

/** Posição persistida da barra livro/ficha/status/inventário (arrastável; mesma estética do menu de áudio). */
const persistedCharacterBarPos = { right: 24, bottom: 260 };

/** Intervalo mínimo entre sinais ao mestre (conteúdo pesado / pausa), por jogador. */
const SAFETY_SIGNAL_COOLDOWN_MS = 90_000;

/** Personagem no palco: uma única lista; PC vs NPC só define "quem acende ao falar" e "seleção do mestre". */
type CharacterOnStage = {
  id: number;
  name: string;
  imageUrl: string | null;
  notes?: string;
  /** true = NPC (acende quando mestre fala por ele); false = PC (acende quando o jogador dono fala ou quando mestre está falando por ele). */
  isNPC: boolean;
};

/** Wire: mantido "actor" por compatibilidade com mensagens LiveKit. */
type VisibilityMsg = {
  type: "show/actor/visible";
  showId: string;
  actor: { id: number; name: string; side: "NPC" | "PC"; imageUrl: string | null; xPct?: number };
  visible: boolean;
};
type PosMsg = { type: "show/actor/pos"; showId: string; actorId: number; xPct: number };
type SelectionMsg = { type: "show/actor/selection"; showId: string; selectedIds: number[] };
/** Estado completo do palco; GM envia ao abrir o palco para o jogador ficar igual ao mestre (evita cópia/duplicação). */
type SyncMsg = {
  type: "show/sync";
  showId: string;
  characters: Array<{
    id: number;
    name: string;
    side: "NPC" | "PC";
    imageUrl: string | null;
    xPct?: number;
    visible: boolean;
  }>;
  /** Barra de dados: visível para jogadores, quantidade, dourado por slot, último resultado, auras visíveis. */
  diceVisible?: boolean;
  diceCount?: number;
  diceGolden?: boolean[];
  diceLastResult?: number[];
  diceShowAuras?: boolean;
};

type DiceVisibleMsg = { type: "show/dice/visible"; showId: string; visible: boolean };
type DiceConfigMsg = { type: "show/dice/config"; showId: string; count: number; golden: boolean[] };
type DiceRollMsg = { type: "show/dice/roll"; showId: string; values: number[] };

type NarrativeSlide = {
  id: string;
  url: string | null;
  isBlack: boolean;
  crop: { x: number; y: number; width: number; height: number } | null;
  order_index: number | null;
};

type SceneTransitionFrame =
  | {
      sceneId: string;
      mode: "narrative";
      narrativeSlide: NarrativeSlide | null;
    }
  | {
      sceneId: string;
      mode: "scenario";
      scenarioImageUrl: string | null;
      scenarioCrop: { x: number; y: number; width: number; height: number } | null;
    };

function EyeOpenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function EyeClosedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
function SpeakForIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

/** Ícone de alerta (sinal de pausa / desconforto ao mestre). */
function PanicAlertIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  );
}

const IMPROV_SCENARIO_PREFIX = "improv-scenario-";
const IMPROV_CHAR_PREFIX = "improv-char-";
const IMPROV_DROP_STAGE = "improv-drop-stage";

type ImprovScenario = {
  id: string;
  name: string;
  description?: string | null;
  image_storage_key: string | null;
  crop_x?: number | null;
  crop_y?: number | null;
  crop_width?: number | null;
  crop_height?: number | null;
};

function ImprovScenarioThumb({
  scenario,
}: {
  scenario: ImprovScenario;
}) {
  const id = IMPROV_SCENARIO_PREFIX + scenario.id;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  const imgUrl = getScenarioImageUrlFromScenario(scenario);
  return (
    <span
      ref={setNodeRef}
      className={"improviso-bar__thumb improviso-bar__scenario-thumb" + (isDragging ? " improviso-bar__thumb--dragging" : "")}
      title="Arraste ao palco para trocar o cenário."
      {...listeners}
      {...attributes}
    >
      <span className="improviso-bar__scenario-thumb-img-wrap">
        {imgUrl ? (
          <img src={imgUrl} alt="" className="improviso-bar__scenario-thumb-img" />
        ) : (
          <span className="improviso-bar__scenario-thumb-placeholder">Sem imagem</span>
        )}
      </span>
      <span className="improviso-bar__scenario-thumb-name">{scenario.name || "(sem nome)"}</span>
    </span>
  );
}

function ImprovCharacterThumb({ character }: { character: GMCharacter }) {
  const id = IMPROV_CHAR_PREFIX + character.id;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      className={"improviso-bar__thumb improviso-bar__char-thumb" + (isDragging ? " improviso-bar__thumb--dragging" : "")}
      title="Arraste à área à esquerda para trazer o personagem (oculto para o público)."
      {...listeners}
      {...attributes}
    >
      <img src={getAvatarUrl(character ?? undefined)} alt="" className="improviso-bar__char-thumb-avatar" />
      <span>{character.name}</span>
    </div>
  );
}

function ImprovStageDropZone({
  disabled,
  children,
}: {
  disabled: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: IMPROV_DROP_STAGE, disabled });
  return (
    <div ref={setNodeRef} className={"improviso-drop improviso-drop--stage" + (disabled ? " improviso-drop--disabled" : "") + (isOver ? " improviso-drop--over" : "")}>
      {children}
    </div>
  );
}

function defaultPositionsForCharacters(characters: CharacterOnStage[]): Record<number, number> {
  const npc = characters.filter((c) => c.isNPC);
  const pc = characters.filter((c) => !c.isNPC);
  const npcXs = [20, 14, 26, 8, 32].slice(0, npc.length);
  const pcXs = [80, 86, 74, 92, 68].slice(0, pc.length);
  const out: Record<number, number> = {};
  npc.forEach((c, i) => {
    out[c.id] = npcXs[i] ?? 20;
  });
  pc.forEach((c, i) => {
    out[c.id] = pcXs[i] ?? 80;
  });
  return out;
}

function clampPositionWhileDragging(next: number): number {
  return Math.max(8, Math.min(92, next));
}
function snapToColumn(xPct: number): number {
  if (xPct >= 8 && xPct <= 32) return xPct;
  if (xPct >= 68 && xPct <= 92) return xPct;
  if (xPct > 32 && xPct < 68) return xPct < 50 ? 32 : 68;
  return xPct < 50 ? 8 : 92;
}

/**
 * Vista do palco no espetáculo.
 * Uma única lista de personagens; PC vs NPC só afeta: (1) PC acende quando o jogador fala, (2) NPC (e PC) sujeitos à seleção do mestre para "falar por".
 */
export function StageView({
  room,
  showId,
  phase,
  storyId,
  sceneId,
  scenarioImageUrl,
  scenarioCrop,
  narrativeSlides,
  currentNarrativeIndex,
  onNarrativeIndexChange,
  isGM,
  gmEmail,
  lobbyParticipants,
  lobbyCharacterIdsKey: _lobbyCharacterIdsKeyFromParent,
  speakingByIdentity,
  playerExpressionSlot = 0,
  resolvedParticipantImageByCharacterId,
  improvisationMode = false,
  isNarrativeScene = false,
  improvisationScenarios = [],
  improvisationCharacters = [],
  onScenarioChange,
  initialStageState,
  playerCharacterId = null,
  floatingMenuPos,
  setFloatingMenuPos,
  canSendSafetySignal = false,
  safetySenderIdentity = null,
  safetyDisplayName,
  safetyEmail,
  safetyCharacterId = null,
  safetyCharacterName = null,
}: {
  room: Room | null;
  showId: string;
  phase: "countdown" | "sliding" | "half" | "stage" | null;
  storyId: string;
  sceneId: string;
  scenarioImageUrl: string | null;
  scenarioCrop?: { x: number; y: number; width: number; height: number } | null;
  narrativeSlides?: NarrativeSlide[];
  currentNarrativeIndex?: number;
  onNarrativeIndexChange?: (index: number) => void;
  /** Estado do palco restaurado na reconexão do mestre (personagens, dados). */
  initialStageState?: {
    characters?: Array<{ id: number; name: string; side: string; imageUrl?: string | null; xPct?: number; visible: boolean }>;
    diceVisible?: boolean;
    diceCount?: number;
    diceGolden?: boolean[];
    diceLastResult?: number[];
    diceShowAuras?: boolean;
  } | null;
  isGM: boolean;
  gmEmail: string | null;
  lobbyParticipants: LobbyParticipant[];
  lobbyCharacterIdsKey?: string;
  speakingByIdentity: Record<string, boolean>;
  /** Slot de expressão atual do jogador (0–9); só para !isGM, para destacar no menu. */
  playerExpressionSlot?: number;
  /** URL da imagem por character_id (override/current); mesma lógica do lobby. */
  resolvedParticipantImageByCharacterId?: Record<number, string>;
  /** Modo improviso (só GM): barras de cenário e personagem + drop zones. */
  improvisationMode?: boolean;
  isNarrativeScene?: boolean;
  improvisationScenarios?: Array<{
    id: string;
    name: string;
    image_storage_key: string | null;
    crop_x?: number | null;
    crop_y?: number | null;
    crop_width?: number | null;
    crop_height?: number | null;
  }>;
  improvisationCharacters?: GMCharacter[];
  onScenarioChange?: (payload: {
    scenarioImageUrl: string | null;
    scenarioCrop: { x: number; y: number; width: number; height: number } | null;
    scenarioId?: string | null;
    scenarioDescription?: string | null;
  }) => void;
  /** Personagem do jogador (avatar no lobby); usado para livro/ficha/status quando não é GM. */
  playerCharacterId?: number | null;
  /** Posição compartilhada do menu flutuante (unificado com áudio). Quando fornecido, a barra usa e atualiza esta posição. */
  floatingMenuPos?: { right: number; bottom: number };
  setFloatingMenuPos?: (pos: { right: number; bottom: number }) => void;
  /** Conta PLAYER: permite enviar sinal discreto ao mestre durante o palco (meio‑aberto ou aberto). */
  canSendSafetySignal?: boolean;
  safetySenderIdentity?: string | null;
  safetyDisplayName?: string;
  safetyEmail?: string;
  safetyCharacterId?: number | null;
  safetyCharacterName?: string | null;
}) {
  const [characters, setCharacters] = useState<CharacterOnStage[]>([]);
  const [visibleForPlayer, setVisibleForPlayer] = useState<Record<number, boolean>>({});
  const [animByCharId, setAnimByCharId] = useState<Record<number, "in-left" | "in-right" | "out-left" | "out-right" | null>>({});
  const [posByCharId, setPosByCharId] = useState<Record<number, number>>({});
  const dragRef = useRef<null | { characterId: number; startClientX: number; startXPct: number }>(null);
  const dragRafRef = useRef<number | null>(null);
  const posRef = useRef<Record<number, number>>({});
  const [selectedCharacterIdsLocal, setSelectedCharacterIdsLocal] = useState<number[]>([]);
  const [selectedCharacterIdsRemote, setSelectedCharacterIdsRemote] = useState<number[]>([]);
  const [openCharacterNotesId, setOpenCharacterNotesId] = useState<number | null>(null);
  const [narrativeLayerA, setNarrativeLayerA] = useState<NarrativeSlide | null>(null);
  const [narrativeLayerB, setNarrativeLayerB] = useState<NarrativeSlide | null>(null);
  const [activeNarrativeLayer, setActiveNarrativeLayer] = useState<"a" | "b">("a");
  const [sceneTransitionFrame, setSceneTransitionFrame] = useState<SceneTransitionFrame | null>(null);
  const [sceneTransitionVisible, setSceneTransitionVisible] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [playerExpressionMenuOpen, setPlayerExpressionMenuOpen] = useState(false);
  const [safetyCooldownSec, setSafetyCooldownSec] = useState(0);
  const [scenariosBarOpen, setScenariosBarOpen] = useState(true);
  const [charactersBarOpen, setCharactersBarOpen] = useState(true);
  /* Livro, ficha, status e inventário: painel aberto e carta de habilidade (sincronizada via LiveKit). */
  const [stageCharacterPanel, setStageCharacterPanel] = useState<"book" | "ficha" | "status" | "inventory" | null>(null);
  const [abilityCard, setAbilityCard] = useState<{ name: string; description: string } | null>(null);
  /* Barra de dados no topo: visível para jogadores (GM controla), count 1–6, golden por slot, rolagem e resultado. */
  const [diceVisibleForPlayers, setDiceVisibleForPlayers] = useState(false);
  const [diceCount, setDiceCount] = useState(1);
  const [diceGolden, setDiceGolden] = useState<boolean[]>([false, false, false, false, false, false]);
  const [diceRolling, setDiceRolling] = useState(false);
  const [diceValues, setDiceValues] = useState<number[] | null>(null);
  const [diceDisplayValues, setDiceDisplayValues] = useState<number[]>([1, 1, 1, 1, 1, 1]);
  const [diceShowAuras, setDiceShowAuras] = useState(false);
  const initialStageStateAppliedRef = useRef(false);

  const diceRollIntervalRef = useRef<number | null>(null);
  const diceRollTimeoutRef = useRef<number | null>(null);
  const draggedRecentlyRef = useRef(false);
  const latestStageStateForPatchRef = useRef<object | null>(null);
  const lastPatchedStageStateRef = useRef<string>("");
  const stagePatchTimeoutRef = useRef<number | null>(null);
  /** Posição da barra de personagem (ou compartilhada com áudio quando floatingMenuPos é passado). */
  const [characterBarPos, setCharacterBarPos] = useState(() => ({ ...persistedCharacterBarPos }));
  const effectiveBarPos = floatingMenuPos ?? characterBarPos;
  const setEffectiveBarPos = setFloatingMenuPos ?? setCharacterBarPos;
  const characterBarDragRef = useRef<{ startX: number; startY: number; startRight: number; startBottom: number; didMove: boolean } | null>(null);
  const characterBarIgnoreClickRef = useRef(false);
  const CHARACTER_BAR_DRAG_THRESHOLD = 8;
  const onCharacterBarDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      characterBarDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startRight: effectiveBarPos.right,
        startBottom: effectiveBarPos.bottom,
        didMove: false,
      };
    },
    [effectiveBarPos.right, effectiveBarPos.bottom]
  );
  const renderedNarrativeSlideRef = useRef<NarrativeSlide | null>(null);
  const narrativeFadeTimeoutRef = useRef<number | null>(null);
  const narrativeFadeRafRef = useRef<number | null>(null);
  const sceneTransitionTimeoutRef = useRef<number | null>(null);
  const sceneTransitionRafRef = useRef<number | null>(null);
  const currentSceneFrameRef = useRef<SceneTransitionFrame | null>(null);
  void _lobbyCharacterIdsKeyFromParent;

  useEffect(() => {
    posRef.current = posByCharId;
  }, [posByCharId]);

  useEffect(() => {
    setCharacters([]);
    setVisibleForPlayer({});
    setAnimByCharId({});
    setPosByCharId({});
    setSelectedCharacterIdsLocal([]);
    setSelectedCharacterIdsRemote([]);
    setOpenCharacterNotesId(null);
  }, [sceneId]);

  /** Aplicar estado do palco restaurado (reconexão do mestre). Deve rodar depois do clear por sceneId. */
  useEffect(() => {
    if (!isGM || !initialStageState || initialStageStateAppliedRef.current) return;
    initialStageStateAppliedRef.current = true;
    try {
      const st = initialStageState;
      if (Array.isArray(st.characters) && st.characters.length > 0) {
        const list: CharacterOnStage[] = [];
        const visible: Record<number, boolean> = {};
        const pos: Record<number, number> = {};
        for (const c of st.characters) {
          const id = typeof c.id === "number" && Number.isFinite(c.id) ? c.id : Number(c.id);
          if (!Number.isFinite(id) || id < 0) continue;
          list.push({
            id,
            name: typeof c.name === "string" ? c.name : "Personagem",
            imageUrl: c.imageUrl != null && typeof c.imageUrl === "string" ? c.imageUrl : null,
            isNPC: c.side === "NPC",
          });
          visible[id] = !!c.visible;
          if (typeof c.xPct === "number" && Number.isFinite(c.xPct)) pos[id] = c.xPct;
        }
        if (list.length > 0) {
          setCharacters(list);
          setVisibleForPlayer(visible);
          setPosByCharId((prev) => ({ ...prev, ...pos }));
        }
      }
      if (typeof st.diceVisible === "boolean") setDiceVisibleForPlayers(st.diceVisible);
      if (typeof st.diceCount === "number" && st.diceCount >= 1 && st.diceCount <= 6) setDiceCount(st.diceCount);
      if (Array.isArray(st.diceGolden) && st.diceGolden.length >= 6) setDiceGolden(st.diceGolden.slice(0, 6).map(Boolean));
      if (Array.isArray(st.diceLastResult) && st.diceLastResult.length > 0) {
        const vals = st.diceLastResult.filter((v) => typeof v === "number" && v >= 1 && v <= 6).slice(0, 6);
        if (vals.length > 0) {
          setDiceValues(vals);
          setDiceDisplayValues((prev) => {
            const next = [...prev];
            vals.forEach((v, i) => {
              if (i < 6) next[i] = v;
            });
            return next;
          });
        }
      }
      if (typeof st.diceShowAuras === "boolean") setDiceShowAuras(st.diceShowAuras);
    } catch (_) {
      /* não quebrar a página se o estado restaurado vier malformado */
    }
  }, [isGM, initialStageState]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setPrefersReducedMotion(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const fetchCharactersForGM = useCallback(async () => {
    if (!storyId || !sceneId) return;
    try {
      const [scRes, lobbyRes, list] = await Promise.all([
        api<SceneCharactersOut>(`/api/gm/stories/${storyId}/scenes/${sceneId}/characters`),
        api<{ participants: LobbyParticipant[] }>("/api/lobby"),
        api<GMCharacter[]>("/api/gm/characters"),
      ]);
      const lobbyParticipantsFromApi = Array.isArray(lobbyRes?.participants) ? lobbyRes.participants : [];
      const lobbyByCharId = new Map<number, LobbyParticipant>();
      const lobbyCharIds: number[] = [];
      lobbyParticipantsFromApi.forEach((p) => {
        if (typeof p.character_id === "number" && !p.is_gm) {
          lobbyByCharId.set(p.character_id, p);
          lobbyCharIds.push(p.character_id);
        }
      });
      const sceneIds = Array.isArray(scRes?.character_ids) ? scRes.character_ids : [];
      const ids = [...new Set([...sceneIds, ...lobbyCharIds])];
      const gmMap = new Map<number, GMCharacter>();
      (Array.isArray(list) ? list : []).forEach((c) => gmMap.set(c.id, c));
      const byId = new Map<number, CharacterOnStage>();
      for (const id of ids) {
        const gmChar = gmMap.get(id);
        const lobby = lobbyByCharId.get(id);
        const isNPC = gmChar
          ? gmChar.kind === "NPC" || (!!gmEmail && gmChar.owner_email === gmEmail)
          : false;
        if (gmChar) {
          const imageUrl =
            lobby?.character_image_url != null && lobby.character_image_url !== ""
              ? getAvatarUrl({ character_image_url: lobby.character_image_url })
              : getAvatarUrl(gmChar);
          byId.set(id, {
            id: gmChar.id,
            name: gmChar.name,
            imageUrl,
            notes: gmChar.notes ?? "",
            isNPC,
          });
          continue;
        }
        if (lobby) {
          byId.set(id, {
            id,
            name: lobby.character_name ?? "Personagem",
            imageUrl: getAvatarUrl({ character_image_url: lobby.character_image_url }),
            notes: "",
            isNPC: false,
          });
        }
      }
      setCharacters((prev) => {
        const fromApi = [...byId.values()];
        const apiIds = new Set(fromApi.map((c) => c.id));
        const keptFromPrev = prev.filter((c) => !apiIds.has(c.id));
        return [...fromApi, ...keptFromPrev];
      });
    } catch {
      setCharacters([]);
    }
  }, [storyId, sceneId, gmEmail, showId]);

  useEffect(() => {
    if (!isGM) return;
    let cancelled = false;
    fetchCharactersForGM();
    const intervalMs = 2500;
    const t = setInterval(() => {
      if (cancelled) return;
      fetchCharactersForGM();
    }, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [isGM, fetchCharactersForGM]);

  useEffect(() => {
    if (characters.length === 0) return;
    setPosByCharId((prev) => {
      const defaults = defaultPositionsForCharacters(characters);
      const next = { ...prev };
      for (const c of characters) {
        if (next[c.id] == null) next[c.id] = defaults[c.id] ?? 50;
      }
      return next;
    });
  }, [characters]);

  useEffect(() => {
    if (isGM) return;
    if (!room) return;
    const decoder = new TextDecoder();
    const handler = (payload: Uint8Array, _p: unknown, _k: unknown, topic?: string) => {
      if (topic && topic !== "espetaculo") return;
      let msg: unknown;
      try {
        msg = JSON.parse(decoder.decode(payload));
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object") return;

      if ((msg as { type?: string }).type === "show/sync") {
        const m = msg as SyncMsg;
        if (m.showId !== showId || !Array.isArray(m.characters)) return;
        const list: CharacterOnStage[] = [];
        const visible: Record<number, boolean> = {};
        const pos: Record<number, number> = {};
        for (const raw of m.characters) {
          if (typeof raw.id !== "number" || !Number.isFinite(raw.id)) continue;
          list.push({
            id: raw.id,
            name: typeof raw.name === "string" ? raw.name : "Personagem",
            imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : null,
            isNPC: raw.side === "NPC",
          });
          visible[raw.id] = !!raw.visible;
          if (typeof raw.xPct === "number" && Number.isFinite(raw.xPct)) pos[raw.id] = raw.xPct;
        }
        setCharacters(list);
        setVisibleForPlayer(visible);
        setPosByCharId((prev) => ({ ...prev, ...pos }));
        if (typeof m.diceVisible === "boolean") setDiceVisibleForPlayers(m.diceVisible);
        if (typeof m.diceCount === "number" && m.diceCount >= 1 && m.diceCount <= 6) setDiceCount(m.diceCount);
        if (Array.isArray(m.diceGolden) && m.diceGolden.length === 6) setDiceGolden(m.diceGolden.map((g) => !!g));
        if (Array.isArray(m.diceLastResult) && m.diceLastResult.length > 0) {
          setDiceValues(m.diceLastResult);
          setDiceDisplayValues((prev) => {
            const next = [...prev];
            m.diceLastResult!.forEach((v, i) => {
              if (i < 6 && v >= 1 && v <= 6) next[i] = v;
            });
            return next;
          });
        }
        if (typeof m.diceShowAuras === "boolean") setDiceShowAuras(m.diceShowAuras);
        return;
      }

      if ((msg as { type?: string }).type === "show/actor/visible") {
        const m = msg as VisibilityMsg;
        if (m.showId !== showId) return;
        const raw = m.actor;
        if (!raw || (typeof raw.id !== "number" && typeof raw.id !== "string")) return;
        const id = Number(raw.id);
        if (!Number.isFinite(id) || id < 0) return;
        const character: CharacterOnStage = {
          id,
          name: typeof raw.name === "string" ? raw.name : "Personagem",
          imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : null,
          isNPC: raw.side === "NPC",
        };

        setCharacters((prev) => {
          const without = prev.filter((c) => c.id !== id);
          const next = [...without, character];
          const byId = new Map(next.map((c) => [c.id, c]));
          return [...byId.values()];
        });
        if (typeof raw.xPct === "number" && Number.isFinite(raw.xPct)) {
          const nextXPct = raw.xPct;
          setPosByCharId((prev) => ({ ...prev, [id]: nextXPct }));
        }

        setVisibleForPlayer((prev) => ({ ...prev, [id]: !!m.visible }));
        const dir = m.visible
          ? (character.isNPC ? "in-left" : "in-right")
          : (character.isNPC ? "out-left" : "out-right");
        setAnimByCharId((prev) => ({ ...prev, [id]: dir }));
        const OUT_ANIM_MS = 280;
        window.setTimeout(() => {
          setAnimByCharId((prev) => ({ ...prev, [id]: null }));
          if (!m.visible) {
            setCharacters((prev) => prev.filter((c) => c.id !== id));
          }
        }, OUT_ANIM_MS);
      } else if ((msg as { type?: string }).type === "show/actor/pos") {
        const m = msg as PosMsg;
        if (m.showId !== showId) return;
        if (typeof m.actorId !== "number" || typeof m.xPct !== "number") return;
        if (!Number.isFinite(m.xPct)) return;
        setPosByCharId((prev) => ({ ...prev, [m.actorId]: m.xPct }));
      } else if (
        (msg as { type?: string }).type === "show/actor/selection" ||
        (msg as { type?: string }).type === "show/npc/selection"
      ) {
        const m = msg as SelectionMsg & { selectedNpcIds?: number[] };
        if (m.showId !== showId) return;
        const ids = Array.isArray((m as { selectedIds?: number[] }).selectedIds)
          ? (m as { selectedIds: number[] }).selectedIds.filter((x: unknown) => typeof x === "number")
          : Array.isArray(m.selectedNpcIds)
            ? m.selectedNpcIds.filter((x) => typeof x === "number")
            : [];
        setSelectedCharacterIdsRemote(ids);
      } else if ((msg as { type?: string }).type === "show/dice/visible") {
        const m = msg as DiceVisibleMsg;
        if (m.showId !== showId) return;
        setDiceVisibleForPlayers(!!m.visible);
      }
    };
    room.on(RoomEvent.DataReceived, handler as (payload: Uint8Array, participant?: unknown, kind?: unknown, topic?: string) => void);
    return () => {
      room.off(RoomEvent.DataReceived, handler as (payload: Uint8Array, participant?: unknown, kind?: unknown, topic?: string) => void);
    };
  }, [room, isGM, showId]);

  /* Mensagens de dados (config e roll): GM e jogadores recebem para manter UI sincronizada. */
  useEffect(() => {
    if (!room) return;
    const decoder = new TextDecoder();
    const handler = (payload: Uint8Array, _p: unknown, _k: unknown, topic?: string) => {
      if (topic && topic !== "espetaculo") return;
      let msg: unknown;
      try {
        msg = JSON.parse(decoder.decode(payload));
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object") return;
      if ((msg as { type?: string }).type === "show/dice/config") {
        const m = msg as DiceConfigMsg;
        if (m.showId !== showId) return;
        if (typeof m.count === "number" && m.count >= 1 && m.count <= 6) setDiceCount(m.count);
        if (Array.isArray(m.golden) && m.golden.length === 6) setDiceGolden(m.golden.map((g) => !!g));
      } else if ((msg as { type?: string }).type === "show/ability/card") {
        const m = msg as { type: string; showId: string; name?: string; description?: string };
        if (m.showId !== showId) return;
        setAbilityCard({
          name: typeof m.name === "string" ? m.name : "",
          description: typeof m.description === "string" ? m.description : "",
        });
      } else if ((msg as { type?: string }).type === "show/ability/card/close") {
        const m = msg as { type: string; showId: string };
        if (m.showId !== showId) return;
        setAbilityCard(null);
      } else if ((msg as { type?: string }).type === "show/dice/roll") {
        const m = msg as DiceRollMsg;
        if (m.showId !== showId || !Array.isArray(m.values)) return;
        const values = m.values.filter((v) => typeof v === "number" && v >= 1 && v <= 6).slice(0, 6);
        if (values.length === 0) return;
        setDiceValues(values);
        setDiceRolling(true);
        if (diceRollIntervalRef.current != null) window.clearInterval(diceRollIntervalRef.current);
        if (diceRollTimeoutRef.current != null) window.clearTimeout(diceRollTimeoutRef.current);
        const ROLL_DURATION_MS = 2500;
        const CYCLE_MS = 120;
        diceRollIntervalRef.current = window.setInterval(() => {
          setDiceDisplayValues((prev) => {
            const next = [...prev];
            for (let i = 0; i < values.length; i++) next[i] = Math.floor(Math.random() * 6) + 1;
            return next;
          });
        }, CYCLE_MS);
        diceRollTimeoutRef.current = window.setTimeout(() => {
          if (diceRollIntervalRef.current != null) window.clearInterval(diceRollIntervalRef.current);
          diceRollIntervalRef.current = null;
          diceRollTimeoutRef.current = null;
          setDiceDisplayValues((prev) => {
            const next = [...prev];
            values.forEach((v, i) => {
              if (i < 6) next[i] = v;
            });
            return next;
          });
          setDiceRolling(false);
          setDiceShowAuras(true);
        }, ROLL_DURATION_MS);
      }
    };
    room.on(RoomEvent.DataReceived, handler as (payload: Uint8Array, participant?: unknown, kind?: unknown, topic?: string) => void);
    return () => {
      room.off(RoomEvent.DataReceived, handler as (payload: Uint8Array, participant?: unknown, kind?: unknown, topic?: string) => void);
    };
  }, [room, showId]);

  const charactersDeduped = useMemo(() => {
    const byId = new Map<number, CharacterOnStage>();
    for (const c of characters) byId.set(c.id, c);
    return [...byId.values()];
  }, [characters]);

  /** Personagem em foco para livro/ficha/status: jogador = próprio ou primeiro PC na cena; mestre = selecionado ou primeiro da cena. */
  const focusCharacterId = useMemo(() => {
    if (isGM) {
      const firstSelected = selectedCharacterIdsLocal[0];
      if (firstSelected != null) return firstSelected;
      return charactersDeduped[0]?.id ?? null;
    }
    return playerCharacterId ?? charactersDeduped.find((c) => !c.isNPC)?.id ?? null;
  }, [isGM, selectedCharacterIdsLocal, charactersDeduped, playerCharacterId]);

  const improvSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 8 } })
  );

  const handleImprovDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const overId = String(over.id);
      const activeId = String(active.id);
      if (overId !== IMPROV_DROP_STAGE) return;

      if (activeId.startsWith(IMPROV_SCENARIO_PREFIX)) {
        if (isNarrativeScene) return;
        const scenarioId = activeId.slice(IMPROV_SCENARIO_PREFIX.length);
        const scenario = improvisationScenarios.find((s) => s.id === scenarioId);
        if (scenario && onScenarioChange) {
          const url = getScenarioImageUrlFromScenario(scenario);
          const crop = scenarioCropFromScenario(scenario);
          onScenarioChange({
            scenarioImageUrl: url,
            scenarioCrop: crop,
            scenarioId: scenario.id,
            scenarioDescription: scenario.description ?? null,
          });
        }
        return;
      }

      if (activeId.startsWith(IMPROV_CHAR_PREFIX)) {
        const characterId = parseInt(activeId.slice(IMPROV_CHAR_PREFIX.length), 10);
        if (!Number.isFinite(characterId)) return;
        const gmChar = improvisationCharacters.find((c) => c.id === characterId);
        if (!gmChar) return;
        const isNPC = gmChar.kind === "NPC" || (!!gmEmail && gmChar.owner_email === gmEmail);
        const imageUrl = getAvatarUrl(gmChar);
        const newChar: CharacterOnStage = {
          id: gmChar.id,
          name: gmChar.name,
          imageUrl,
          notes: gmChar.notes ?? "",
          isNPC,
        };
        const existing = characters.find((c) => c.id === characterId);
        if (existing) {
          setPosByCharId((prev) => ({ ...prev, [characterId]: 10 }));
          setVisibleForPlayer((prev) => ({ ...prev, [characterId]: false }));
        } else {
          setCharacters((prev) => {
            const without = prev.filter((c) => c.id !== characterId);
            const next = [...without, newChar];
            const byId = new Map(next.map((c) => [c.id, c]));
            return [...byId.values()];
          });
          setPosByCharId((prev) => ({ ...prev, [characterId]: 10 }));
          setVisibleForPlayer((prev) => ({ ...prev, [characterId]: false }));
        }
        const msg: VisibilityMsg = {
          type: "show/actor/visible",
          showId,
          actor: { id: characterId, name: gmChar.name, side: isNPC ? "NPC" : "PC", imageUrl, xPct: 10 },
          visible: false,
        };
        try {
          room?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(msg)), {
            reliable: true,
            topic: "espetaculo",
          });
        } catch {}
      }
    },
    [
      improvisationScenarios,
      improvisationCharacters,
      onScenarioChange,
      characters,
      gmEmail,
      showId,
      room,
      isNarrativeScene,
    ]
  );

  useEffect(() => {
    if (!isGM || phase !== "stage" || !room) return;
    const t = window.setTimeout(() => {
      const payload: SyncMsg = {
        type: "show/sync",
        showId,
        characters: charactersDeduped.map((c) => ({
          id: c.id,
          name: c.name,
          side: c.isNPC ? "NPC" : "PC",
          imageUrl: c.imageUrl,
          xPct: posByCharId[c.id],
          visible: !!visibleForPlayer[c.id],
        })),
        diceVisible: diceVisibleForPlayers,
        diceCount,
        diceGolden,
        diceLastResult: diceValues ?? undefined,
        diceShowAuras,
      };
      const stagePayload = {
        characters: payload.characters,
        diceVisible: payload.diceVisible,
        diceCount: payload.diceCount,
        diceGolden: payload.diceGolden,
        diceLastResult: payload.diceLastResult,
        diceShowAuras: payload.diceShowAuras,
      };
      latestStageStateForPatchRef.current = stagePayload;

      const payloadStr = JSON.stringify(stagePayload);
      if (payloadStr !== lastPatchedStageStateRef.current) {
        if (stagePatchTimeoutRef.current != null) window.clearTimeout(stagePatchTimeoutRef.current);
        stagePatchTimeoutRef.current = window.setTimeout(() => {
          stagePatchTimeoutRef.current = null;
          const toSend = latestStageStateForPatchRef.current;
          if (toSend && typeof toSend === "object") {
            lastPatchedStageStateRef.current = JSON.stringify(toSend);
            api("/api/show/active/stage", {
              method: "PATCH",
              body: JSON.stringify(toSend),
            }).catch(() => {});
          }
        }, 2000);
      }

      try {
        room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(payload)), {
          reliable: true,
          topic: "espetaculo",
        });
      } catch {}
    }, 600);
    return () => {
      clearTimeout(t);
      if (stagePatchTimeoutRef.current != null) {
        window.clearTimeout(stagePatchTimeoutRef.current);
        stagePatchTimeoutRef.current = null;
      }
    };
  }, [isGM, phase, room, sceneId, showId, charactersDeduped, visibleForPlayer, posByCharId, diceVisibleForPlayers, diceCount, diceGolden, diceValues, diceShowAuras]);

  useEffect(() => {
    return () => {
      if (diceRollIntervalRef.current != null) window.clearInterval(diceRollIntervalRef.current);
      if (diceRollTimeoutRef.current != null) window.clearTimeout(diceRollTimeoutRef.current);
      diceRollIntervalRef.current = null;
      diceRollTimeoutRef.current = null;
    };
  }, []);

  const getDiceImageSrc = useCallback((face: number) => {
    const n = Math.max(1, Math.min(6, Math.floor(face)));
    const base =
      (typeof window !== "undefined" && window.location?.origin) ||
      (typeof import.meta.env?.BASE_URL === "string" ? import.meta.env.BASE_URL : "/");
    const path = base === "/" || !base ? `/assets/dice/dice-${n}.png` : `${base.replace(/\/$/, "")}/assets/dice/dice-${n}.png`;
    return path;
  }, []);

  const handleDiceCountClick = useCallback(
    (slotIndex: number) => {
      const count = slotIndex + 1;
      if (count < 1 || count > 6) return;
      setDiceShowAuras(false);
      setDiceCount(count);
      const msg: DiceConfigMsg = { type: "show/dice/config", showId, count, golden: diceGolden };
      try {
        room?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(msg)), {
          reliable: true,
          topic: "espetaculo",
        });
      } catch {}
    },
    [showId, room, diceGolden]
  );

  /* Checkbox do slot i: se já está marcado, desmarca do 0 ao i (permite desmarcar o primeiro). Senão, marca os primeiros i+1 como dourados. */
  const handleDiceGoldenToggle = useCallback(
    (slotIndex: number) => {
      if (slotIndex < 0 || slotIndex >= 6) return;
      setDiceShowAuras(false);
      const isCurrentlyGolden = diceGolden[slotIndex];
      const next = isCurrentlyGolden
        ? diceGolden.map((_, j) => (j <= slotIndex ? false : diceGolden[j]))
        : Array.from({ length: 6 }, (_, j) => j <= slotIndex);
      setDiceGolden(next);
      const msg: DiceConfigMsg = { type: "show/dice/config", showId, count: diceCount, golden: next };
      try {
        room?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(msg)), {
          reliable: true,
          topic: "espetaculo",
        });
      } catch {}
    },
    [showId, room, diceCount, diceGolden]
  );

  const handleDiceRoll = useCallback(() => {
    if (diceRolling || !room) return;
    const count = Math.max(1, Math.min(6, diceCount));
    const values = Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1);
    const msg: DiceRollMsg = { type: "show/dice/roll", showId, values };
    try {
      room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(msg)), {
        reliable: true,
        topic: "espetaculo",
      });
    } catch {}
    setDiceValues(values);
    setDiceRolling(true);
    if (diceRollIntervalRef.current != null) window.clearInterval(diceRollIntervalRef.current);
    if (diceRollTimeoutRef.current != null) window.clearTimeout(diceRollTimeoutRef.current);
    const ROLL_DURATION_MS = 2500;
    const CYCLE_MS = 120;
    diceRollIntervalRef.current = window.setInterval(() => {
      setDiceDisplayValues((prev) => {
        const next = [...prev];
        for (let i = 0; i < count; i++) next[i] = Math.floor(Math.random() * 6) + 1;
        return next;
      });
    }, CYCLE_MS);
    diceRollTimeoutRef.current = window.setTimeout(() => {
      if (diceRollIntervalRef.current != null) window.clearInterval(diceRollIntervalRef.current);
      diceRollIntervalRef.current = null;
      diceRollTimeoutRef.current = null;
      setDiceDisplayValues((prev) => {
        const next = [...prev];
        values.forEach((v, i) => {
          if (i < 6) next[i] = v;
        });
        return next;
      });
      setDiceRolling(false);
      setDiceShowAuras(true);
    }, ROLL_DURATION_MS);
  }, [diceRolling, room, showId, diceCount]);

  const handleDiceVisibleToggle = useCallback(() => {
    const next = !diceVisibleForPlayers;
    setDiceVisibleForPlayers(next);
    const msg: DiceVisibleMsg = { type: "show/dice/visible", showId, visible: next };
    try {
      room?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(msg)), {
        reliable: true,
        topic: "espetaculo",
      });
    } catch {}
  }, [showId, room, diceVisibleForPlayers]);

  /** Última ação preenchida na barra (para atualizar dados ao gastar motivação). */
  const lastDiceFromActionRef = useRef({ rating: 1, gilded: false });
  /** Preencher a barra de dados a partir de uma ação Candela (rating 0–3, gilded = primeiro dourado; extraDice = dados por motivação gasta). */
  const handleFillDiceFromAction = useCallback(
    (rating: number, gilded: boolean, extraDice = 0) => {
      const count = Math.max(1, Math.min(6, rating + extraDice));
      lastDiceFromActionRef.current = { rating, gilded };
      setDiceShowAuras(false);
      setDiceCount(count);
      const golden = Array.from({ length: 6 }, (_, i) => i === 0 && gilded);
      setDiceGolden(golden);
      const msg: DiceConfigMsg = { type: "show/dice/config", showId, count, golden };
      try {
        room?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(msg)), {
          reliable: true,
          topic: "espetaculo",
        });
      } catch {}
    },
    [showId, room]
  );
  /** Atualizar apenas a quantidade de dados na rolagem quando o jogador gasta motivação (mais um dado por ponto gasto). */
  const handleMotivationChange = useCallback(
    (extraDice: number) => {
      const { rating, gilded } = lastDiceFromActionRef.current;
      const count = Math.max(1, Math.min(6, rating + extraDice));
      setDiceShowAuras(false);
      setDiceCount(count);
      const golden = Array.from({ length: 6 }, (_, i) => i === 0 && gilded);
      setDiceGolden(golden);
      const msg: DiceConfigMsg = { type: "show/dice/config", showId, count, golden };
      try {
        room?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(msg)), {
          reliable: true,
          topic: "espetaculo",
        });
      } catch {}
    },
    [showId, room]
  );

  const handleShowAbilityCard = useCallback(
    (abilityId: number, name: string, description: string) => {
      try {
        room?.localParticipant.publishData(
          new TextEncoder().encode(
            JSON.stringify({
              type: "show/ability/card",
              showId,
              abilityId,
              name,
              description,
            })
          ),
          { reliable: true, topic: "espetaculo" }
        );
      } catch {}
      setAbilityCard({ name, description });
    },
    [showId, room]
  );

  useEffect(() => {
    if (!isGM) return;
    const onMove = (e: MouseEvent) => {
      const r = dragRef.current;
      if (!r) return;
      const w = window.innerWidth || 1;
      const dxPct = ((e.clientX - r.startClientX) / w) * 100;
      setPosByCharId((prev) => {
        const current = prev[r.characterId] ?? r.startXPct;
        const next = r.startXPct + dxPct;
        const clamped = clampPositionWhileDragging(next);
        if (Math.abs(current - clamped) < 0.01) return prev;
        return { ...prev, [r.characterId]: clamped };
      });
      if (dragRafRef.current == null) {
        dragRafRef.current = window.requestAnimationFrame(() => {
          dragRafRef.current = null;
          const characterId = dragRef.current?.characterId;
          if (!characterId) return;
          const xPct = posRef.current[characterId];
          if (typeof xPct !== "number") return;
          const msg: PosMsg = { type: "show/actor/pos", showId, actorId: characterId, xPct };
          try {
            room?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(msg)), {
              reliable: false,
              topic: "espetaculo",
            });
          } catch {}
        });
      }
    };
    const onUp = () => {
      const r = dragRef.current;
      if (!r) return;
      let xPct = posRef.current[r.characterId];
      if (typeof xPct !== "number") xPct = r.startXPct;
      xPct = snapToColumn(xPct);
      setPosByCharId((prev) => ({ ...prev, [r.characterId]: xPct }));
      const didMove = Math.abs(xPct - r.startXPct) > 1;
      dragRef.current = null;
      if (didMove) {
        draggedRecentlyRef.current = true;
        window.setTimeout(() => {
          draggedRecentlyRef.current = false;
        }, 180);
      }
      const msg: PosMsg = { type: "show/actor/pos", showId, actorId: r.characterId, xPct };
      try {
        room?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(msg)), {
          reliable: true,
          topic: "espetaculo",
        });
      } catch {}
    };
    window.addEventListener("mousemove", onMove, { capture: true });
    window.addEventListener("mouseup", onUp, { capture: true });
    return () => {
      window.removeEventListener("mousemove", onMove, { capture: true });
      window.removeEventListener("mouseup", onUp, { capture: true });
      if (dragRafRef.current != null) window.cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    };
  }, [isGM, room, showId]);

  /** Arrastar a barra de personagem (livro/ficha/status/inventário). */
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = characterBarDragRef.current;
      if (!r) return;
      const dx = e.clientX - r.startX;
      const dy = r.startY - e.clientY;
      if (!r.didMove && (Math.abs(dx) > CHARACTER_BAR_DRAG_THRESHOLD || Math.abs(dy) > CHARACTER_BAR_DRAG_THRESHOLD)) {
        r.didMove = true;
      }
      if (r.didMove) {
        const right = Math.max(0, r.startRight - dx);
        const bottom = Math.max(0, r.startBottom + dy);
        if (!setFloatingMenuPos) {
          persistedCharacterBarPos.right = right;
          persistedCharacterBarPos.bottom = bottom;
        }
        setEffectiveBarPos({ right, bottom });
      }
    };
    const onUp = () => {
      const r = characterBarDragRef.current;
      if (r?.didMove) characterBarIgnoreClickRef.current = true;
      characterBarDragRef.current = null;
    };
    const opts = { capture: true };
    window.addEventListener("mousemove", onMove, opts);
    window.addEventListener("mouseup", onUp, opts);
    return () => {
      window.removeEventListener("mousemove", onMove, opts);
      window.removeEventListener("mouseup", onUp, opts);
    };
  }, [setEffectiveBarPos, setFloatingMenuPos]);

  const selectedCharacterSet = useMemo(() => {
    const ids = isGM ? selectedCharacterIdsLocal : selectedCharacterIdsRemote;
    return new Set<number>(ids ?? []);
  }, [isGM, selectedCharacterIdsLocal, selectedCharacterIdsRemote]);

  const gmSpeaking = speakingByIdentity["gm"] ?? false;
  const identityByCharacterId = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of lobbyParticipants || []) {
      if (p.is_gm) continue;
      if (typeof p.character_id === "number" && typeof p.identity === "string") {
        map.set(p.character_id, p.identity);
      }
    }
    return map;
  }, [lobbyParticipants]);

  const isNarrativeMode = Array.isArray(narrativeSlides) && narrativeSlides.length > 0;
  const narrativeIndex = Math.max(0, Math.min(currentNarrativeIndex ?? 0, narrativeSlides?.length ? narrativeSlides.length - 1 : 0));
  const narrativeSlide = isNarrativeMode ? narrativeSlides![narrativeIndex] : null;

  useEffect(() => {
    const nextFrame: SceneTransitionFrame = isNarrativeMode
      ? {
          sceneId,
          mode: "narrative",
          narrativeSlide,
        }
      : {
          sceneId,
          mode: "scenario",
          scenarioImageUrl,
          scenarioCrop: scenarioCrop ?? null,
        };
    const previousFrame = currentSceneFrameRef.current;
    if (previousFrame && previousFrame.sceneId !== sceneId) {
      if (sceneTransitionTimeoutRef.current != null) window.clearTimeout(sceneTransitionTimeoutRef.current);
      if (sceneTransitionRafRef.current != null) window.cancelAnimationFrame(sceneTransitionRafRef.current);
      if (prefersReducedMotion) {
        setSceneTransitionFrame(null);
        setSceneTransitionVisible(false);
      } else {
        setSceneTransitionFrame(previousFrame);
        setSceneTransitionVisible(true);
        sceneTransitionRafRef.current = window.requestAnimationFrame(() => {
          setSceneTransitionVisible(false);
          sceneTransitionRafRef.current = null;
        });
        sceneTransitionTimeoutRef.current = window.setTimeout(() => {
          setSceneTransitionFrame(null);
          sceneTransitionTimeoutRef.current = null;
        }, 900);
      }
    }
    currentSceneFrameRef.current = nextFrame;
  }, [isNarrativeMode, narrativeSlide, prefersReducedMotion, scenarioCrop, scenarioImageUrl, sceneId]);

  useEffect(() => {
    return () => {
      if (sceneTransitionTimeoutRef.current != null) window.clearTimeout(sceneTransitionTimeoutRef.current);
      if (sceneTransitionRafRef.current != null) window.cancelAnimationFrame(sceneTransitionRafRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isNarrativeMode || !narrativeSlide) {
      renderedNarrativeSlideRef.current = null;
      setNarrativeLayerA(null);
      setNarrativeLayerB(null);
      setActiveNarrativeLayer("a");
      return;
    }
    const previous = renderedNarrativeSlideRef.current;
    if (!previous) {
      renderedNarrativeSlideRef.current = narrativeSlide;
      setNarrativeLayerA(narrativeSlide);
      setNarrativeLayerB(null);
      setActiveNarrativeLayer("a");
      return;
    }
    if (previous.id === narrativeSlide.id) {
      if (activeNarrativeLayer === "a") setNarrativeLayerA(narrativeSlide);
      else setNarrativeLayerB(narrativeSlide);
      return;
    }
    if (narrativeFadeTimeoutRef.current != null) window.clearTimeout(narrativeFadeTimeoutRef.current);
    if (narrativeFadeRafRef.current != null) window.cancelAnimationFrame(narrativeFadeRafRef.current);
    renderedNarrativeSlideRef.current = narrativeSlide;
    if (prefersReducedMotion) {
      if (activeNarrativeLayer === "a") {
        setNarrativeLayerA(narrativeSlide);
        setNarrativeLayerB(null);
      } else {
        setNarrativeLayerB(narrativeSlide);
        setNarrativeLayerA(null);
      }
      return;
    }
    const oldLayer = activeNarrativeLayer;
    const nextLayer = oldLayer === "a" ? "b" : "a";
    if (nextLayer === "a") setNarrativeLayerA(narrativeSlide);
    else setNarrativeLayerB(narrativeSlide);
    narrativeFadeRafRef.current = window.requestAnimationFrame(() => {
      setActiveNarrativeLayer(nextLayer);
      narrativeFadeRafRef.current = null;
    });
    narrativeFadeTimeoutRef.current = window.setTimeout(() => {
      if (oldLayer === "a") setNarrativeLayerA(null);
      else setNarrativeLayerB(null);
      narrativeFadeTimeoutRef.current = null;
    }, 900);
    return () => {
      if (narrativeFadeTimeoutRef.current != null) window.clearTimeout(narrativeFadeTimeoutRef.current);
      if (narrativeFadeRafRef.current != null) window.cancelAnimationFrame(narrativeFadeRafRef.current);
    };
  }, [activeNarrativeLayer, isNarrativeMode, narrativeSlide, prefersReducedMotion]);

  useEffect(() => {
    return () => {
      if (narrativeFadeTimeoutRef.current != null) window.clearTimeout(narrativeFadeTimeoutRef.current);
      if (narrativeFadeRafRef.current != null) window.cancelAnimationFrame(narrativeFadeRafRef.current);
    };
  }, []);

  const publishNarrativeSlide = useCallback(
    (index: number) => {
      onNarrativeIndexChange?.(index);
      try {
        room?.localParticipant.publishData(
          new TextEncoder().encode(JSON.stringify({ type: "show/narrative/slide", showId, index })),
          { reliable: true, topic: "espetaculo" }
        );
      } catch {}
    },
    [onNarrativeIndexChange, room, showId]
  );

  useEffect(() => {
    if (safetyCooldownSec <= 0) return;
    const id = window.setTimeout(() => setSafetyCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(id);
  }, [safetyCooldownSec]);

  const sendSafetyPanic = useCallback(async () => {
    if (!room?.localParticipant || !canSendSafetySignal) return;
    const identity = safetySenderIdentity?.trim() || room.localParticipant.identity;
    const payload = {
      type: "safety/panic",
      at: Date.now(),
      identity,
      ...(safetyDisplayName?.trim() ? { displayName: safetyDisplayName.trim() } : {}),
      ...(safetyEmail?.trim() ? { email: safetyEmail.trim() } : {}),
      ...(safetyCharacterId != null ? { characterId: safetyCharacterId } : {}),
      ...(safetyCharacterName?.trim() ? { characterName: safetyCharacterName.trim() } : {}),
    };
    const enc = new TextEncoder().encode(JSON.stringify(payload));
    try {
      await room.localParticipant.publishData(enc, {
        reliable: true,
        topic: "safety",
        destinationIdentities: ["gm"],
      });
    } catch {
      try {
        await room.localParticipant.publishData(enc, { reliable: true, topic: "safety" });
      } catch {
        /* silencioso */
      }
    }
    setSafetyCooldownSec(Math.ceil(SAFETY_SIGNAL_COOLDOWN_MS / 1000));
  }, [
    room,
    canSendSafetySignal,
    safetySenderIdentity,
    safetyDisplayName,
    safetyEmail,
    safetyCharacterId,
    safetyCharacterName,
  ]);

  function narrativeMotionVars(slide: NarrativeSlide): CSSProperties {
    const seed = slide.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const dirX = seed % 2 === 0 ? 1 : -1;
    const dirY = seed % 3 === 0 ? 1 : -1;
    return {
      ["--pan-start-x" as const]: `${-0.8 * dirX}%`,
      ["--pan-end-x" as const]: `${0.8 * dirX}%`,
      ["--pan-start-y" as const]: `${-0.5 * dirY}%`,
      ["--pan-end-y" as const]: `${0.5 * dirY}%`,
    } as CSSProperties;
  }

  function renderNarrativeSlide(slide: NarrativeSlide, className: string) {
    if (slide.isBlack) {
      return <div className={className + " stage-view__narrative-black"} />;
    }
    const crop = slide.crop;
    const validCrop =
      crop &&
      Number.isFinite(crop.x) &&
      Number.isFinite(crop.y) &&
      crop.width > 0 &&
      crop.width <= 1 &&
      crop.height > 0 &&
      crop.height <= 1;
    if (!validCrop) {
      return (
        <div className={className + " stage-view__narrative-bg"}>
          <img
            src={slide.url || ""}
            alt=""
            aria-hidden
            className="stage-view__narrative-media"
            style={narrativeMotionVars(slide)}
          />
        </div>
      );
    }
    const w = crop.width;
    const h = crop.height;
    const imgWidth = `${(100 / w).toFixed(2)}%`;
    const imgHeight = `${(100 / h).toFixed(2)}%`;
    const left = `${(-(crop.x / w) * 100).toFixed(2)}%`;
    const top = `${(-(crop.y / h) * 100).toFixed(2)}%`;
    return (
      <div className={className + " stage-view__narrative-bg"}>
        <img
          src={slide.url || ""}
          alt=""
          aria-hidden
          className="stage-view__narrative-media"
          style={{
            width: imgWidth,
            height: imgHeight,
            left,
            top,
            ...narrativeMotionVars(slide),
          }}
        />
      </div>
    );
  }

  function renderSceneTransitionFrame(frame: SceneTransitionFrame) {
    if (frame.mode === "narrative") {
      const slide = frame.narrativeSlide;
      if (!slide || slide.isBlack) {
        return <div className="stage-view__scene-transition-fill stage-view__scene-transition-fill--black" />;
      }
      return (
        <ScenarioBackground
          imageUrl={slide.url}
          crop={slide.crop ?? undefined}
          className="stage-view__scene-transition-fill"
        />
      );
    }
    return (
      <ScenarioBackground
        imageUrl={frame.scenarioImageUrl}
        crop={frame.scenarioCrop ?? undefined}
        className="stage-view__scene-transition-fill"
      />
    );
  }

  const visibleNarrativeSlide = activeNarrativeLayer === "a" ? narrativeLayerA : narrativeLayerB;

  const safetyPhaseOk = phase === "half" || phase === "stage";
  const playerStageChrome =
    !isGM ? (
      <>
        {canSendSafetySignal && safetyPhaseOk && room != null && (
          <div className="stage-view__player-panic">
            <button
              type="button"
              className="stage-view__player-panic-btn"
              disabled={safetyCooldownSec > 0}
              onClick={() => void sendSafetyPanic()}
              aria-label="Alerta ao mestre: preciso de pausa ou ajuste na mesa. Só o mestre é notificado, sem som."
              title={
                safetyCooldownSec > 0
                  ? `Aguarde ${safetyCooldownSec}s para enviar novamente`
                  : "Alerta ao mestre — um toque envia o sinal (só o mestre vê; sem som)"
              }
            >
              <PanicAlertIcon className="stage-view__player-panic-icon" />
            </button>
          </div>
        )}
        <div className="stage-view__player-expression">
          <button
            type="button"
            className={"stage-view__player-expression-trigger" + (playerExpressionMenuOpen ? " is-open" : "")}
            onClick={() => setPlayerExpressionMenuOpen((o) => !o)}
            aria-expanded={playerExpressionMenuOpen}
            aria-label={playerExpressionMenuOpen ? "Recolher expressões do avatar" : "Ver expressões do avatar"}
            title={playerExpressionMenuOpen ? "Recolher" : "Expressões do avatar"}
          >
            🎭
          </button>
          {playerExpressionMenuOpen && (
            <div className="stage-view__player-expression-panel" role="dialog" aria-label="Expressões do avatar">
              {( [
                { slot: 0, label: "Padrão", emoji: "🙂" },
                { slot: 1, label: "Assustado", emoji: "😱" },
                { slot: 2, label: "Rindo", emoji: "😂" },
                { slot: 3, label: "Furioso", emoji: "😠" },
                { slot: 4, label: "Ferido / com dor", emoji: "🤕" },
                { slot: 5, label: "Personalizado 1", emoji: "🎭" },
                { slot: 6, label: "Personalizado 2", emoji: "🎭" },
                { slot: 7, label: "Pesquisando", emoji: "🤔" },
                { slot: 8, label: "Atordoado/Incapacitado", emoji: "😵" },
                { slot: 9, label: "Off", emoji: "👤" },
              ] as const ).map(({ slot, label, emoji }) => {
                const isCurrent = playerExpressionSlot === slot;
                const displayNum = slot === 9 ? 0 : slot + 1;
                return (
                  <div
                    key={slot}
                    className={"stage-view__player-expression-item" + (isCurrent ? " stage-view__player-expression-item--current" : "")}
                  >
                    <span className="stage-view__player-expression-emoji" aria-hidden>{emoji}</span>
                    <span className="stage-view__player-expression-text">
                      {displayNum} – {label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </>
    ) : null;

  if (isNarrativeMode && visibleNarrativeSlide) {
    return (
      <div className={"stage-view stage-view--narrative" + (isGM ? " stage-view--gm" : "")}>
        {narrativeLayerA && (
          <div
            className={
              "stage-view__narrative-layer " +
              (activeNarrativeLayer === "a"
                ? "stage-view__narrative-layer--visible"
                : "stage-view__narrative-layer--hidden")
            }
          >
            {renderNarrativeSlide(narrativeLayerA, "")}
          </div>
        )}
        {narrativeLayerB && (
          <div
            className={
              "stage-view__narrative-layer " +
              (activeNarrativeLayer === "b"
                ? "stage-view__narrative-layer--visible"
                : "stage-view__narrative-layer--hidden")
            }
          >
            {renderNarrativeSlide(narrativeLayerB, "")}
          </div>
        )}
        {isGM && (
          <div className="stage-view__narrative-controls">
            <button
              type="button"
              className="ui-btn ui-btn--ghost stage-view__narrative-btn"
              disabled={narrativeIndex <= 0}
              onClick={() => narrativeIndex > 0 && publishNarrativeSlide(narrativeIndex - 1)}
              aria-label="Imagem anterior"
            >
              ← Anterior
            </button>
            <span className="stage-view__narrative-indicator" aria-live="polite">
              {narrativeIndex + 1} / {narrativeSlides!.length}
            </span>
            <button
              type="button"
              className="ui-btn ui-btn--ghost stage-view__narrative-btn"
              disabled={narrativeIndex >= narrativeSlides!.length - 1}
              onClick={() =>
                narrativeIndex < narrativeSlides!.length - 1 &&
                publishNarrativeSlide(narrativeIndex + 1)
              }
              aria-label="Próxima imagem"
            >
              Próxima →
            </button>
          </div>
        )}
        {sceneTransitionFrame && (
          <div
            className={
              "stage-view__scene-transition-layer " +
              (sceneTransitionVisible
                ? "stage-view__scene-transition-layer--visible"
                : "stage-view__scene-transition-layer--hidden")
            }
          >
            {renderSceneTransitionFrame(sceneTransitionFrame)}
          </div>
        )}
        {playerStageChrome}
      </div>
    );
  }

  const showDiceBarPhase = phase === "half" || phase === "stage";
  const diceBarVisible = isGM || diceVisibleForPlayers;
  const activeValues = diceDisplayValues.slice(0, diceCount).filter((v) => v >= 1 && v <= 6);
  const hasFour = activeValues.some((v) => v === 4);
  const hasFive = activeValues.some((v) => v === 5);
  const isMixedResult = diceShowAuras && !diceRolling && hasFour && hasFive;

  const stageContent = (
    <div className={"stage-view" + (isGM ? " stage-view--gm" : "")}>
      {showDiceBarPhase && (
        <div
          className={
            "stage-dice-bar" +
            (diceBarVisible ? " stage-dice-bar--visible" : " stage-dice-bar--hidden")
          }
          aria-label="Dados"
          aria-hidden={!diceBarVisible}
        >
          <div className="stage-dice-bar__inner">
            <div
              className={
                "stage-dice-bar__dice-area" + (isMixedResult ? " stage-dice-bar__dice-area--coral" : "")
              }
            >
              {[0, 1, 2, 3, 4, 5].map((i) => {
                const active = i < diceCount;
                const face = active ? (diceDisplayValues[i] ?? i + 1) : i + 1;
                const golden = diceGolden[i];
                const showAura = diceShowAuras && active && !diceRolling;
                const auraClass =
                  showAura && face === 6
                    ? " stage-dice-bar__die-wrap--aura-moss"
                    : showAura && (face === 4 || face === 5)
                      ? " stage-dice-bar__die-wrap--aura-coral"
                      : showAura && (face >= 1 && face <= 3)
                        ? " stage-dice-bar__die-wrap--aura-wine"
                        : "";
                return (
                  <div
                    key={i}
                    className={
                      "stage-dice-bar__slot" +
                      (active ? " stage-dice-bar__slot--active" : " stage-dice-bar__slot--empty") +
                      (diceRolling && active ? " stage-dice-bar__slot--rolling" : "")
                    }
                    onClick={() => handleDiceCountClick(i)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleDiceCountClick(i);
                      }
                    }}
                    aria-label={active ? `Dado ${i + 1} de ${diceCount}; clique para escolher quantidade de dados` : `Clique para usar ${i + 1} dado${i > 0 ? "s" : ""}`}
                  >
                    <div className={"stage-dice-bar__die-wrap" + auraClass}>
                      <img
                        key={`dice-slot-${i}`}
                        src={getDiceImageSrc(face)}
                        alt=""
                        className={
                          "stage-dice-bar__die-img" +
                          (!active ? " stage-dice-bar__die-img--grey" : "") +
                          (active && golden ? " stage-dice-bar__die-img--golden" : "")
                        }
                        draggable={false}
                        onLoad={(e) => {
                          const el = e.target as HTMLImageElement;
                          el.style.display = "";
                          const wrap = el.closest(".stage-dice-bar__die-wrap");
                          wrap?.querySelectorAll(".stage-dice-bar__die-placeholder").forEach((node) => node.remove());
                        }}
                        onError={(e) => {
                          const el = e.target as HTMLImageElement;
                          el.style.display = "none";
                          const wrap = el.closest(".stage-dice-bar__die-wrap");
                          if (wrap && !wrap.querySelector(".stage-dice-bar__die-placeholder")) {
                            const ph = document.createElement("span");
                            ph.className = "stage-dice-bar__die-placeholder";
                            ph.setAttribute("aria-hidden", "true");
                            el.after(ph);
                          }
                        }}
                      />
                    </div>
                    {active && (
                      <label className="stage-dice-bar__golden" onClick={(ev) => ev.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={golden}
                          onChange={() => handleDiceGoldenToggle(i)}
                          aria-label={`Marcar até o dado ${i + 1} como dourado`}
                          title={golden ? `Dourados: ${i + 1} (clique para alterar)` : `Clique para marcar os ${i + 1} primeiros como dourados`}
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="stage-dice-bar__actions">
              {isGM && (
                <button
                  type="button"
                  className="stage-dice-bar__visibility-btn"
                  onClick={handleDiceVisibleToggle}
                  title={diceVisibleForPlayers ? "Ocultar dados dos jogadores" : "Mostrar dados aos jogadores"}
                  aria-label={diceVisibleForPlayers ? "Ocultar barra de dados dos jogadores" : "Mostrar barra de dados aos jogadores"}
                >
                  {diceVisibleForPlayers ? <EyeOpenIcon className="stage-dice-bar__eye-icon" /> : <EyeClosedIcon className="stage-dice-bar__eye-icon" />}
                </button>
              )}
              <button
                type="button"
                className="ui-btn stage-dice-bar__roll-btn"
                onClick={handleDiceRoll}
                disabled={diceRolling}
                aria-label="Rolar dados"
              >
                {diceRolling ? "Rolando…" : "Rolar"}
              </button>
            </div>
          </div>
        </div>
      )}
      <ScenarioBackground
        imageUrl={scenarioImageUrl}
        crop={scenarioCrop ?? undefined}
        className="stage-view__scenario"
      />
      {isGM && improvisationMode && (
        <ImprovStageDropZone disabled={false}>
          <span className="improviso-drop__hint">
            {isNarrativeScene
              ? "Solte um personagem aqui para trazê-lo (oculto)"
              : "Solte cenário para trocar ou personagem para trazer (oculto)"}
          </span>
        </ImprovStageDropZone>
      )}
      <div className="stage-view__grid" aria-hidden="true">
        <div className="stage-view__col stage-view__col--1" />
        <div className="stage-view__col stage-view__col--2" />
        <div className="stage-view__col stage-view__col--3" />
        <div className="stage-view__col stage-view__col--4" />
        <div className="stage-view__col stage-view__col--5" />
      </div>

      <div className="stage-view__actors" aria-label="Palco">
        {(isGM ? phase === "stage" : true) &&
          charactersDeduped.map((c) => {
            const anim = animByCharId[c.id];
            const visible = isGM ? true : !!visibleForPlayer[c.id];
            const shouldRender = isGM ? true : visible || (anim != null && anim.startsWith("out"));
            if (!shouldRender) return null;
            const x = posByCharId[c.id] ?? (c.isNPC ? 20 : 80);
            const selected = selectedCharacterSet.has(c.id);
            const identity = identityByCharacterId.get(c.id);
            const speaking =
              (selected && gmSpeaking) || (!c.isNPC && identity != null && (speakingByIdentity[identity] ?? false));
            const lookRight = x < 50;
            const visibleToPlayer = !!visibleForPlayer[c.id];

            return (
              <div
                key={c.id}
                className={`stage-actor ${c.isNPC ? "stage-actor--npc" : "stage-actor--pc"} ${anim ? `stage-actor--${anim}` : ""} ${
                  lookRight ? "stage-actor--look-right" : "stage-actor--look-left"
                } ${isGM && selected ? "stage-actor--selected" : ""} ${speaking ? "stage-actor--speaking" : "stage-actor--silent"}`}
                style={{ left: `${x}%` }}
                onMouseDown={(e) => {
                  if (!isGM) return;
                  if ((e.target as HTMLElement).closest(".stage-actor__eye-btn, .stage-actor__select-btn, .stage-actor__note-btn, .stage-actor__notes")) return;
                  e.preventDefault();
                  dragRef.current = { characterId: c.id, startClientX: e.clientX, startXPct: x };
                }}
                onClick={(e) => {
                  if (!isGM) return;
                  if ((e.target as HTMLElement).closest(".stage-actor__eye-btn, .stage-actor__select-btn, .stage-actor__note-btn, .stage-actor__notes")) return;
                  if (draggedRecentlyRef.current) return;
                  setSelectedCharacterIdsLocal((prev) => {
                    const has = prev.includes(c.id);
                    const next = has ? prev.filter((id) => id !== c.id) : [...prev, c.id];
                    const msg: SelectionMsg = { type: "show/actor/selection", showId, selectedIds: next };
                    try {
                      room?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(msg)), {
                        reliable: true,
                        topic: "espetaculo",
                      });
                    } catch {}
                    return next;
                  });
                }}
              >
                <img
                  className="stage-actor__img"
                  src={resolvedParticipantImageByCharacterId?.[c.id] ?? c.imageUrl ?? "/assets/jogador_default.png"}
                  alt=""
                  draggable={false}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/assets/jogador_default.png";
                  }}
                />
                {isGM && (
                  <>
                    <button
                      type="button"
                      className={"stage-actor__note-btn" + (openCharacterNotesId === c.id ? " is-active" : "")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenCharacterNotesId((prev) => (prev === c.id ? null : c.id));
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      title="Ler notas do personagem"
                      aria-label={`Ler notas de ${c.name}`}
                    >
                      <InfoIcon />
                    </button>
                    <button
                      type="button"
                      className={"stage-actor__select-btn" + (selected ? " is-selected" : "")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCharacterIdsLocal((prev) => {
                          const has = prev.includes(c.id);
                          const next = has ? prev.filter((id) => id !== c.id) : [...prev, c.id];
                          const msg: SelectionMsg = { type: "show/actor/selection", showId, selectedIds: next };
                          try {
                            room?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(msg)), {
                              reliable: true,
                              topic: "espetaculo",
                            });
                          } catch {}
                          return next;
                        });
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      title={selected ? "Desselecionar" : "Selecionar (fala por este personagem quando você falar)"}
                      aria-label={selected ? "Desselecionar" : "Selecionar para falar por este personagem"}
                    >
                      <SpeakForIcon />
                    </button>
                    <button
                      type="button"
                      className="stage-actor__eye-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        const nextVisible = !visibleToPlayer;
                        setVisibleForPlayer((prev) => ({ ...prev, [c.id]: nextVisible }));
                        const xPct = posByCharId[c.id];
                        const msg: VisibilityMsg = {
                          type: "show/actor/visible",
                          showId,
                          actor: {
                            id: c.id,
                            name: c.name,
                            side: c.isNPC ? "NPC" : "PC",
                            imageUrl: c.imageUrl,
                            xPct,
                          },
                          visible: nextVisible,
                        };
                        try {
                          room?.localParticipant.publishData(
                            new TextEncoder().encode(JSON.stringify(msg)),
                            { reliable: true, topic: "espetaculo" }
                          );
                        } catch {}
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      title={visibleToPlayer ? "Ocultar do jogador" : "Tornar visível ao jogador"}
                      aria-label={visibleToPlayer ? "Ocultar do jogador" : "Tornar visível ao jogador"}
                    >
                      {visibleToPlayer ? <EyeOpenIcon /> : <EyeClosedIcon />}
                    </button>
                    {openCharacterNotesId === c.id && (
                      <div className="stage-actor__notes" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="stage-actor__notes-title">{c.name}</div>
                        <div className="stage-actor__notes-body">{c.notes?.trim() ? c.notes : "Sem notas."}</div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
      </div>

      {isGM && phase !== "stage" && (
        <div className="stage-view__gm-bar">
          <span style={{ color: "white", opacity: 0.85 }}>Abrindo o palco…</span>
        </div>
      )}
      {sceneTransitionFrame && (
        <div
          className={
            "stage-view__scene-transition-layer " +
            (sceneTransitionVisible
              ? "stage-view__scene-transition-layer--visible"
              : "stage-view__scene-transition-layer--hidden")
          }
        >
          {renderSceneTransitionFrame(sceneTransitionFrame)}
        </div>
      )}

      {playerStageChrome}
      {abilityCard && (
        <AbilityCardOverlay
          showId={showId}
          name={abilityCard.name}
          description={abilityCard.description}
          onClose={() => setAbilityCard(null)}
          room={room}
        />
      )}
    </div>
  );

  const characterBarPortal = showDiceBarPhase && createPortal(
    <div
      className="stage-character-bar-wrap stage-character-bar-wrap--fixed stage-character-bar-wrap--audio-style"
      style={{ right: effectiveBarPos.right, bottom: effectiveBarPos.bottom }}
      aria-label="Personagem: livro, ficha, status e inventário"
    >
      {stageCharacterPanel && focusCharacterId != null && (
        <div className="stage-character-panel-wrap stage-character-panel-wrap--open-left">
          <div className="stage-character-panel-drag-handle" onMouseDown={onCharacterBarDragStart} title="Arraste para mover">
            <span className="stage-character-panel-drag-dots" aria-hidden>⋯</span>
            <span className="stage-character-panel-drag-title">
              {stageCharacterPanel === "book" ? "Livro" : stageCharacterPanel === "ficha" ? "Ficha" : stageCharacterPanel === "status" ? "Status" : "Inventário"}
            </span>
          </div>
          {stageCharacterPanel === "book" && (
            <StageBookPanel
              characterId={focusCharacterId}
              isGM={isGM}
              onClose={() => setStageCharacterPanel(null)}
            />
          )}
          {stageCharacterPanel === "ficha" && (
            <StageFichaPanel
              characterId={focusCharacterId}
              isGM={isGM}
              onClose={() => setStageCharacterPanel(null)}
              onActionClick={handleFillDiceFromAction}
              onMotivationChange={handleMotivationChange}
              onAbilityClick={handleShowAbilityCard}
            />
          )}
          {stageCharacterPanel === "status" && (
            <StageStatusPanel
              characterId={focusCharacterId}
              isGM={isGM}
              onClose={() => setStageCharacterPanel(null)}
            />
          )}
          {stageCharacterPanel === "inventory" && (
            <StageInventoryPanel
              characterId={focusCharacterId}
              isGM={isGM}
              onClose={() => setStageCharacterPanel(null)}
            />
          )}
        </div>
      )}
      <StageCharacterBar
        focusCharacterId={focusCharacterId}
        panelOpen={stageCharacterPanel}
        onDragStart={onCharacterBarDragStart}
        onBook={() => {
          if (characterBarIgnoreClickRef.current) {
            characterBarIgnoreClickRef.current = false;
            return;
          }
          setStageCharacterPanel((p) => (p === "book" ? null : "book"));
        }}
        onFicha={() => {
          if (characterBarIgnoreClickRef.current) {
            characterBarIgnoreClickRef.current = false;
            return;
          }
          setStageCharacterPanel((p) => (p === "ficha" ? null : "ficha"));
        }}
        onStatus={() => {
          if (characterBarIgnoreClickRef.current) {
            characterBarIgnoreClickRef.current = false;
            return;
          }
          setStageCharacterPanel((p) => (p === "status" ? null : "status"));
        }}
        onInventory={() => {
          if (characterBarIgnoreClickRef.current) {
            characterBarIgnoreClickRef.current = false;
            return;
          }
          setStageCharacterPanel((p) => (p === "inventory" ? null : "inventory"));
        }}
      />
    </div>,
    document.body
  );

  if (isGM && improvisationMode) {
    return (
      <DndContext sensors={improvSensors} collisionDetection={rectIntersection} onDragEnd={handleImprovDragEnd}>
        {stageContent}
        {characterBarPortal}
        <div
          className={
            "improviso-bar improviso-bar--scenarios improviso-bar--left" +
            (scenariosBarOpen ? " improviso-bar--open" : "")
          }
          aria-label="Barra de cenários (improviso)"
        >
          <button
            type="button"
            className="improviso-bar__handle"
            onClick={() => setScenariosBarOpen((o) => !o)}
            aria-expanded={scenariosBarOpen}
            aria-label={scenariosBarOpen ? "Recolher barra de cenários" : "Expandir barra de cenários"}
          >
            <span className="improviso-bar__handle-icon" aria-hidden>{scenariosBarOpen ? "▼" : "▶"}</span>
            <span className="improviso-bar__handle-label">Cenários</span>
          </button>
          {scenariosBarOpen && (
            <div className="improviso-bar__content">
              {isNarrativeScene ? (
                <p className="improviso-bar__placeholder">Cena narrativa — sem cenário.</p>
              ) : (
                <div className="improviso-bar__thumbs">
                  {improvisationScenarios.map((sc) => (
                    <ImprovScenarioThumb key={sc.id} scenario={sc} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div
          className={
            "improviso-bar improviso-bar--characters improviso-bar--right" +
            (charactersBarOpen ? " improviso-bar--open" : "")
          }
          aria-label="Barra de personagens (improviso)"
        >
          <button
            type="button"
            className="improviso-bar__handle"
            onClick={() => setCharactersBarOpen((o) => !o)}
            aria-expanded={charactersBarOpen}
            aria-label={charactersBarOpen ? "Recolher barra de personagens" : "Expandir barra de personagens"}
          >
            <span className="improviso-bar__handle-icon" aria-hidden>{charactersBarOpen ? "▼" : "▶"}</span>
            <span className="improviso-bar__handle-label">Personagens</span>
          </button>
          {charactersBarOpen && (
            <div className="improviso-bar__content">
              <div className="improviso-bar__thumbs">
                {improvisationCharacters.map((c) => (
                  <ImprovCharacterThumb key={c.id} character={c} />
                ))}
              </div>
            </div>
          )}
        </div>
      </DndContext>
    );
  }

  return (
    <>
      {stageContent}
      {characterBarPortal}
    </>
  );
}
