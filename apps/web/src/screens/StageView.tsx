import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { RoomEvent, type Room } from "livekit-client";
import type { LobbyParticipant } from "./LobbyScreen";
import { ScenarioBackground } from "./SceneStagePreview";
import type { GMCharacter } from "../types/character";
import { getAvatarUrl } from "../utils/avatar";

type SceneCharactersOut = { character_ids: number[] };

/** Personagem no palco: uma única lista; PC vs NPC só define "quem acende ao falar" e "seleção do mestre". */
type CharacterOnStage = {
  id: number;
  name: string;
  imageUrl: string | null;
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
};

type NarrativeSlide = {
  id: string;
  url: string | null;
  isBlack: boolean;
  crop: { x: number; y: number; width: number; height: number } | null;
  order_index: number | null;
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
  lobbyCharacterIdsKey: lobbyCharacterIdsKeyFromParent,
  speakingByIdentity,
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
  isGM: boolean;
  gmEmail: string | null;
  lobbyParticipants: LobbyParticipant[];
  lobbyCharacterIdsKey?: string;
  speakingByIdentity: Record<string, boolean>;
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
  const draggedRecentlyRef = useRef(false);
  const syncSentForShowIdRef = useRef<string | null>(null);

  const lobbyCharacterIdsKey = useMemo(
    () =>
      lobbyCharacterIdsKeyFromParent ??
      [...new Set((lobbyParticipants || []).map((p) => p.character_id).filter((id): id is number => id != null))]
        .sort((a, b) => a - b)
        .join(","),
    [lobbyCharacterIdsKeyFromParent, lobbyParticipants]
  );

  useEffect(() => {
    posRef.current = posByCharId;
  }, [posByCharId]);

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
            isNPC,
          });
          continue;
        }
        if (lobby) {
          byId.set(id, {
            id,
            name: lobby.character_name ?? "Personagem",
            imageUrl: getAvatarUrl({ character_image_url: lobby.character_image_url }),
            isNPC: false,
          });
        }
      }
      setCharacters([...byId.values()]);
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
          setPosByCharId((prev) => ({ ...prev, [id]: raw.xPct }));
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
      }
    };
    room.on(RoomEvent.DataReceived, handler as (payload: Uint8Array, participant?: unknown, kind?: unknown, topic?: string) => void);
    return () => {
      room.off(RoomEvent.DataReceived, handler as (payload: Uint8Array, participant?: unknown, kind?: unknown, topic?: string) => void);
    };
  }, [room, isGM, showId]);

  const charactersDeduped = useMemo(() => {
    const byId = new Map<number, CharacterOnStage>();
    for (const c of characters) byId.set(c.id, c);
    return [...byId.values()];
  }, [characters]);

  useEffect(() => {
    if (!isGM || phase !== "stage" || !room || showId === syncSentForShowIdRef.current) return;
    const t = window.setTimeout(() => {
      syncSentForShowIdRef.current = showId;
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
      };
      try {
        room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(payload)), {
          reliable: true,
          topic: "espetaculo",
        });
      } catch {}
    }, 600);
    return () => clearTimeout(t);
  }, [isGM, phase, room, showId, charactersDeduped, visibleForPlayer, posByCharId]);

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

  if (isNarrativeMode && narrativeSlide) {
    return (
      <div className={"stage-view stage-view--narrative" + (isGM ? " stage-view--gm" : "")}>
        <div className="stage-view__narrative-layer">
          {narrativeSlide.isBlack ? (
            <div className="stage-view__narrative-black" />
          ) : (
            <ScenarioBackground
              imageUrl={narrativeSlide.url}
              crop={narrativeSlide.crop ?? undefined}
              className="stage-view__narrative-bg"
            />
          )}
        </div>
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
      </div>
    );
  }

  return (
    <div className={"stage-view" + (isGM ? " stage-view--gm" : "")}>
      <ScenarioBackground
        imageUrl={scenarioImageUrl}
        crop={scenarioCrop ?? undefined}
        className="stage-view__scenario"
      />
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
                  if ((e.target as HTMLElement).closest(".stage-actor__eye-btn, .stage-actor__select-btn")) return;
                  e.preventDefault();
                  dragRef.current = { characterId: c.id, startClientX: e.clientX, startXPct: x };
                }}
                onClick={(e) => {
                  if (!isGM) return;
                  if ((e.target as HTMLElement).closest(".stage-actor__eye-btn, .stage-actor__select-btn")) return;
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
                  src={c.imageUrl || "/assets/jogador_default.png"}
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
    </div>
  );
}
