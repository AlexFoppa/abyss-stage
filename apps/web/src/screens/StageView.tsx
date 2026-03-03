import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { RoomEvent, type Room } from "livekit-client";
import type { LobbyParticipant } from "./LobbyScreen";
import { ScenarioBackground } from "./SceneStagePreview";
type GMCharacter = {
  id: number;
  name: string;
  owner_email: string;
  default_image_url?: string | null;
  default_image_rev?: string | null;
};

type SceneCharactersOut = { character_ids: number[] };

type ActorSide = "NPC" | "PC";
type Actor = {
  id: number;
  name: string;
  side: ActorSide;
  imageUrl: string | null;
};

type VisibilityMsg = {
  type: "show/actor/visible";
  showId: string;
  actor: { id: number; name: string; side: ActorSide; imageUrl: string | null; xPct?: number };
  visible: boolean;
};

type PosMsg = { type: "show/actor/pos"; showId: string; actorId: number; xPct: number };
/** Seleção de quem fala quando o mestre fala (NPCs e PCs — ex.: jogador faltando). */
type SelectionMsg = { type: "show/actor/selection"; showId: string; selectedIds: number[] };

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
function SelectedBadgeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
/** Ícone "falar por este personagem" (balão de fala — não confundir com mute/unmute). */
function SpeakForIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function portraitUrl(c: { default_image_url?: string | null; default_image_rev?: string | null }) {
  if (!c.default_image_url) return null;
  if (c.default_image_rev) return `${c.default_image_url}?rev=${c.default_image_rev}`;
  return c.default_image_url;
}

function computePositions(count: number, side: ActorSide) {
  const base = side === "NPC" ? 20 : 80;
  const deltas =
    side === "NPC"
      ? [0, -6, +6, -12, +12, -18, +18, -24, +24]
      : [0, +6, -6, +12, -12, +18, -18, +24, -24];
  const min = side === "NPC" ? 8 : 68;
  const max = side === "NPC" ? 32 : 92;

  const xs: number[] = [];
  for (let i = 0; i < count; i++) {
    const d = deltas[i] ?? deltas[deltas.length - 1];
    const x = base + d;
    xs.push(i < deltas.length ? Math.max(min, Math.min(max, x)) : x);
  }
  return xs;
}

/** Durante o arraste: permite 8–92% (imagem inverte ao cruzar 50%). Na soltura, coluna 3 (32–68%) não pode ficar ocupada. */
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
 * Vista do palco quando o espetáculo está em andamento (cortinas abertas).
 * Grid 5 colunas: NPCs nas colunas 1–2, PCs nas 4–5, coluna 3 vazia.
 * Mestre vê todos os personagens; jogador só os que o mestre tornou visíveis.
 * Estado (visibilidade, posições, seleção de NPCs) é sincronizado via LiveKit;
 * jogadores mantêm o último estado válido (resiliência à desconexão do mestre).
 */
export function StageView({
  room,
  showId,
  phase,
  storyId,
  sceneId,
  scenarioImageUrl,
  scenarioCrop,
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
  isGM: boolean;
  gmEmail: string | null;
  lobbyParticipants: LobbyParticipant[];
  /** Chave estável (ex.: do Routes) para evitar refetch a cada poll; quando não passada, usa a derivada de lobbyParticipants. */
  lobbyCharacterIdsKey?: string;
  speakingByIdentity: Record<string, boolean>;
}) {
  const [actors, setActors] = useState<Actor[]>([]);
  const [visibleForPlayer, setVisibleForPlayer] = useState<Record<number, boolean>>({});
  const [animByActor, setAnimByActor] = useState<Record<number, "in-left" | "in-right" | "out-left" | "out-right" | null>>({});
  const [posByActor, setPosByActor] = useState<Record<number, number>>({});
  const dragRef = useRef<null | { actorId: number; startClientX: number; startXPct: number }>(null);
  const dragRafRef = useRef<number | null>(null);
  const posRef = useRef<Record<number, number>>({});
  const [selectedActorIdsLocal, setSelectedActorIdsLocal] = useState<number[]>([]);
  const [selectedActorIdsRemote, setSelectedActorIdsRemote] = useState<number[]>([]);
  const draggedRecentlyRef = useRef(false);

  const lobbyParticipantsRef = useRef(lobbyParticipants);
  lobbyParticipantsRef.current = lobbyParticipants;
  /** Chave estável para o efeito de fetch: usa a do parent quando fornecida, senão deriva de lobbyParticipants. */
  const lobbyCharacterIdsKey = useMemo(
    () =>
      lobbyCharacterIdsKeyFromParent ??
      [...new Set((lobbyParticipants || []).map((p) => p.character_id).filter((id): id is number => id != null))]
        .sort((a, b) => a - b)
        .join(","),
    [lobbyCharacterIdsKeyFromParent, lobbyParticipants]
  );

  useEffect(() => {
    posRef.current = posByActor;
  }, [posByActor]);

  useEffect(() => {
    if (!isGM) return;
    if (!storyId || !sceneId) return;
    const lobbyByCharId = new Map<number, LobbyParticipant>();
    (lobbyParticipantsRef.current || []).forEach((p) => {
      if (typeof p.character_id === "number" && !p.is_gm) lobbyByCharId.set(p.character_id, p);
    });
    let cancelled = false;
    (async () => {
      try {
        const sc = await api<SceneCharactersOut>(`/api/gm/stories/${storyId}/scenes/${sceneId}/characters`);
        const ids = Array.isArray(sc?.character_ids) ? sc.character_ids : [];
        const list = await api<GMCharacter[]>("/api/gm/characters");
        const gmMap = new Map<number, GMCharacter>();
        (Array.isArray(list) ? list : []).forEach((c) => gmMap.set(c.id, c));
        const next: Actor[] = ids
          .map((id) => {
            const gmChar = gmMap.get(id);
            if (gmChar) {
              return {
                id: gmChar.id,
                name: gmChar.name,
                side: gmEmail && gmChar.owner_email === gmEmail ? ("NPC" as const) : ("PC" as const),
                imageUrl: portraitUrl(gmChar) ?? null,
              };
            }
            const lobby = lobbyByCharId.get(id);
            if (lobby) {
              return {
                id,
                name: lobby.character_name ?? "Personagem",
                side: "PC" as const,
                imageUrl: lobby.character_image_url ?? null,
              };
            }
            return null;
          })
          .filter((a): a is Actor => a != null);
        if (!cancelled) setActors(next);
      } catch {
        if (!cancelled) setActors([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isGM, storyId, sceneId, gmEmail, lobbyCharacterIdsKey]);

  useEffect(() => {
    // inicializa posições default para atores novos (GM e PLAYER)
    const all = actors;
    if (all.length === 0) return;
    setPosByActor((prev) => {
      const next = { ...prev };
      const npc = all.filter((a) => a.side === "NPC");
      const pc = all.filter((a) => a.side === "PC");
      const npcXs = computePositions(npc.length, "NPC");
      const pcXs = computePositions(pc.length, "PC");
      npc.forEach((a, idx) => {
        if (next[a.id] == null) next[a.id] = npcXs[idx] ?? 20;
      });
      pc.forEach((a, idx) => {
        if (next[a.id] == null) next[a.id] = pcXs[idx] ?? 80;
      });
      return next;
    });
  }, [actors]);

  useEffect(() => {
    if (isGM) return;
    if (!room) return;
    const decoder = new TextDecoder();
    const handler = (payload: Uint8Array, _p: any, _k: any, topic?: string) => {
      if (topic && topic !== "espetaculo") return;
      let msg: any;
      try {
        msg = JSON.parse(decoder.decode(payload));
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "show/actor/visible") {
        const m = msg as VisibilityMsg;
        if (m.showId !== showId) return;
        const actor = m.actor;
        if (!actor || typeof actor.id !== "number") return;

        setActors((prev) => {
          const exists = prev.some((a) => a.id === actor.id);
          if (exists) return prev.map((a) => (a.id === actor.id ? { ...a, ...actor } : a));
          return [...prev, actor];
        });
        if (typeof actor.xPct === "number" && Number.isFinite(actor.xPct)) {
          setPosByActor((prev) => ({ ...prev, [actor.id]: actor.xPct! }));
        }

        setVisibleForPlayer((prev) => ({ ...prev, [actor.id]: !!m.visible }));
        const side = actor.side;
        const dir =
          side === "NPC"
            ? m.visible
              ? ("in-left" as const)
              : ("out-left" as const)
            : m.visible
              ? ("in-right" as const)
              : ("out-right" as const);
        setAnimByActor((prev) => ({ ...prev, [actor.id]: dir }));
        window.setTimeout(() => {
          setAnimByActor((prev) => ({ ...prev, [actor.id]: null }));
        }, 600);
      } else if (msg.type === "show/actor/pos") {
        const m = msg as PosMsg;
        if (m.showId !== showId) return;
        if (typeof m.actorId !== "number" || typeof m.xPct !== "number") return;
        if (!Number.isFinite(m.xPct)) return;
        setPosByActor((prev) => ({ ...prev, [m.actorId]: m.xPct }));
      } else if (msg.type === "show/actor/selection" || msg.type === "show/npc/selection") {
        const m = msg as SelectionMsg & { selectedNpcIds?: number[] };
        if (m.showId !== showId) return;
        const ids = Array.isArray((m as any).selectedIds)
          ? (m as any).selectedIds.filter((x: unknown) => typeof x === "number")
          : Array.isArray(m.selectedNpcIds)
            ? m.selectedNpcIds.filter((x) => typeof x === "number")
            : [];
        setSelectedActorIdsRemote(ids);
      }
    };
    room.on(RoomEvent.DataReceived, handler as any);
    return () => {
      room.off(RoomEvent.DataReceived, handler as any);
    };
  }, [room, isGM, showId]);

  const npcActors = useMemo(() => actors.filter((a) => a.side === "NPC"), [actors]);
  const pcActors = useMemo(() => actors.filter((a) => a.side === "PC"), [actors]);

  useEffect(() => {
    if (!isGM) return;
    const onMove = (e: MouseEvent) => {
      const r = dragRef.current;
      if (!r) return;
      const w = window.innerWidth || 1;
      const dxPct = ((e.clientX - r.startClientX) / w) * 100;
      setPosByActor((prev) => {
        const current = prev[r.actorId] ?? r.startXPct;
        const actor = actors.find((a) => a.id === r.actorId);
        if (!actor) return prev;
        const next = r.startXPct + dxPct;
        const clamped = clampPositionWhileDragging(next);
        if (Math.abs(current - clamped) < 0.01) return prev;
        return { ...prev, [r.actorId]: clamped };
      });

      if (dragRafRef.current == null) {
        dragRafRef.current = window.requestAnimationFrame(() => {
          dragRafRef.current = null;
          const actorId = dragRef.current?.actorId;
          if (!actorId) return;
          const xPct = posRef.current[actorId];
          if (typeof xPct !== "number") return;
          const msg: PosMsg = { type: "show/actor/pos", showId, actorId, xPct };
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
      let xPct = posRef.current[r.actorId];
      if (typeof xPct !== "number") xPct = r.startXPct;
      xPct = snapToColumn(xPct);
      setPosByActor((prev) => ({ ...prev, [r.actorId]: xPct }));
      const didMove = Math.abs(xPct - r.startXPct) > 1;
      dragRef.current = null;
      if (didMove) {
        draggedRecentlyRef.current = true;
        window.setTimeout(() => {
          draggedRecentlyRef.current = false;
        }, 180);
      }
      const msg: PosMsg = { type: "show/actor/pos", showId, actorId: r.actorId, xPct };
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
  }, [isGM, actors, room, showId]);

  const selectedActorSet = useMemo(() => {
    const ids = (isGM ? selectedActorIdsLocal : selectedActorIdsRemote) || [];
    return new Set<number>(ids);
  }, [isGM, selectedActorIdsLocal, selectedActorIdsRemote]);

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
          npcActors.map((a) => {
            const anim = animByActor[a.id];
            const visible = isGM ? true : !!visibleForPlayer[a.id];
            const shouldRender = isGM ? true : visible || (anim && anim.startsWith("out"));
            if (!shouldRender) return null;
            const x = posByActor[a.id] ?? 20;
            const selected = selectedActorSet.has(a.id);
            const speaking = selected && gmSpeaking;
            const lookRight = x < 50;
            const visibleToPlayer = !!visibleForPlayer[a.id];
            return (
              <div
                key={a.id}
                className={`stage-actor stage-actor--npc ${anim ? `stage-actor--${anim}` : ""} ${
                  lookRight ? "stage-actor--look-right" : "stage-actor--look-left"
                } ${isGM && selected ? "stage-actor--selected" : ""} ${speaking ? "stage-actor--speaking" : "stage-actor--silent"}`}
                style={{ left: `${x}%` }}
                onMouseDown={(e) => {
                  if (!isGM) return;
                  if ((e.target as HTMLElement).closest(".stage-actor__eye-btn, .stage-actor__select-btn")) return;
                  e.preventDefault();
                  dragRef.current = { actorId: a.id, startClientX: e.clientX, startXPct: x };
                }}
                onClick={(e) => {
                  if (!isGM) return;
                  if ((e.target as HTMLElement).closest(".stage-actor__eye-btn, .stage-actor__select-btn")) return;
                  if (draggedRecentlyRef.current) return;
                  setSelectedActorIdsLocal((prev) => {
                    const has = prev.includes(a.id);
                    const next = has ? prev.filter((id) => id !== a.id) : [...prev, a.id];
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
                  src={a.imageUrl || "/assets/jogador_default.png"}
                  alt=""
                  draggable={false}
                />
                {isGM && (
                  <>
                    <button
                      type="button"
                      className={"stage-actor__select-btn" + (selected ? " is-selected" : "")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedActorIdsLocal((prev) => {
                          const has = prev.includes(a.id);
                          const next = has ? prev.filter((id) => id !== a.id) : [...prev, a.id];
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
                      title={selected ? "Desselecionar (não fala por você)" : "Selecionar (fala por você quando você falar)"}
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
                        setVisibleForPlayer((prev) => ({ ...prev, [a.id]: nextVisible }));
                        const xPct = posByActor[a.id];
                        const msg: VisibilityMsg = {
                          type: "show/actor/visible",
                          showId,
                          actor: { id: a.id, name: a.name, side: a.side, imageUrl: a.imageUrl, xPct },
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
        {(isGM ? phase === "stage" : true) &&
          pcActors.map((a) => {
            const anim = animByActor[a.id];
            const visible = isGM ? true : !!visibleForPlayer[a.id];
            const shouldRender = isGM ? true : visible || (anim && anim.startsWith("out"));
            if (!shouldRender) return null;
            const x = posByActor[a.id] ?? 80;
            const identity = identityByCharacterId.get(a.id);
            const selected = selectedActorSet.has(a.id);
            const speaking = (selected && gmSpeaking) || (identity ? (speakingByIdentity[identity] ?? false) : false);
            const lookRight = x < 50;
            const visibleToPlayer = !!visibleForPlayer[a.id];
            return (
              <div
                key={a.id}
                className={`stage-actor stage-actor--pc ${anim ? `stage-actor--${anim}` : ""} ${
                  lookRight ? "stage-actor--look-right" : "stage-actor--look-left"
                } ${isGM && selected ? "stage-actor--selected" : ""} ${speaking ? "stage-actor--speaking" : "stage-actor--silent"}`}
                style={{ left: `${x}%` }}
                onMouseDown={(e) => {
                  if (!isGM) return;
                  if ((e.target as HTMLElement).closest(".stage-actor__eye-btn, .stage-actor__select-btn")) return;
                  e.preventDefault();
                  dragRef.current = { actorId: a.id, startClientX: e.clientX, startXPct: x };
                }}
                onClick={(e) => {
                  if (!isGM) return;
                  if ((e.target as HTMLElement).closest(".stage-actor__eye-btn, .stage-actor__select-btn")) return;
                  if (draggedRecentlyRef.current) return;
                  setSelectedActorIdsLocal((prev) => {
                    const has = prev.includes(a.id);
                    const next = has ? prev.filter((id) => id !== a.id) : [...prev, a.id];
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
                  src={a.imageUrl || "/assets/jogador_default.png"}
                  alt=""
                  draggable={false}
                />
                {isGM && (
                  <>
                    <button
                      type="button"
                      className={"stage-actor__select-btn" + (selected ? " is-selected" : "")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedActorIdsLocal((prev) => {
                          const has = prev.includes(a.id);
                          const next = has ? prev.filter((id) => id !== a.id) : [...prev, a.id];
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
                      title={selected ? "Desselecionar (não fala por este jogador)" : "Selecionar para falar por este jogador (ex.: jogador faltando)"}
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
                      setVisibleForPlayer((prev) => ({ ...prev, [a.id]: nextVisible }));
                      const xPct = posByActor[a.id];
                      const msg: VisibilityMsg = {
                        type: "show/actor/visible",
                        showId,
                        actor: { id: a.id, name: a.name, side: a.side, imageUrl: a.imageUrl, xPct },
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
