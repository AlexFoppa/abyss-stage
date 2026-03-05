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
import { EditProfileScreen } from "./screens/EditProfileScreen";
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
  
  const [selectedCharacter, setSelectedCharacter] = useState<null | {
    id: number;
    name: string;
    system: string;
    imageUrl?: string | null;
  }>(null);
  
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
  }>(null);
  const [showTick, setShowTick] = useState(0);

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

  const view: View = useMemo(() => {
    if (loading) return "LOGIN";
    if (!user) return "LOGIN";
    if (user.must_reset_password) return "RESET";
    if (subView === "CREATE_CHARACTER" || subView === "EDIT_CHARACTER" || subView === "EDIT_PROFILE") return subView;

    if (effectiveRole === "GM") return gmSubView;
    return subView;
  }, [user, loading, subView, effectiveRole, gmSubView]);

  useEffect(() => {
    setStageMode(view === "CREATE_CHARACTER" || view === "EDIT_CHARACTER" ? "ZOOM_IN" : "IDLE");
  }, [view]);

  const displayNameForUser = user ? (user.name?.trim() || user.email) : "";

  useEffect(() => {
    if (!show) return;
    const t = setInterval(() => setShowTick((x) => x + 1), 200);
    return () => clearInterval(t);
  }, [show?.id]);

  const showPhase = useMemo(() => {
    if (!show) return null;
    const countdownMs = 10_000;
    const t = Date.now();
    const elapsed = t - show.startedAt;
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
    const remaining = Math.max(0, countdownMs - elapsed);
    return Math.max(1, Math.ceil(remaining / 1000));
  }, [show, showPhase, showTick]);

  const espetaculoPhase =
    showPhase === "sliding" || showPhase === "half" || showPhase === "stage" ? showPhase : null;

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
        const id = typeof msg.showId === "string" ? msg.showId : String(startedAtFromMsg);
        if (!Number.isFinite(startedAtFromMsg) || !storyId || !sceneId) return;
        /* Log temporário: confirme no console do jogador se esta linha aparece ao mestre abrir as cortinas; pode remover depois. */
        if (typeof console !== "undefined" && console.log) {
          console.log("[espetaculo] show/start received", { storyId, sceneId, from: participant?.identity });
        }
        /* Sempre atualizar com startedAt: Date.now() para que o countdown de 10s seja correto para quem recebe a mensagem. */
        setShow({
          id,
          startedAt: Date.now(),
          storyId,
          sceneId,
          scenarioId,
          scenarioImageUrl,
          scenarioCrop: null,
        });
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
  }, [liveKitRoom]);

  useEffect(() => {
    if (!logged && liveKitRoom) {
      liveKitRoom.disconnect();
      setLiveKitRoom(null);
    }
  }, [logged, liveKitRoom]);

  const isLobbyView = view === "LOBBY";
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
    if (!isLobbyView || !user) return;
    const heartbeat = () => {
      api("/api/lobby/me", {
        method: "POST",
        body: JSON.stringify({ character_id: selectedCharacter?.id ?? null }),
      })
        .then(() => fetchLobby())
        .catch(() => {});
    };
    heartbeat();
    const t = setInterval(heartbeat, 25000);
    return () => clearInterval(t);
  }, [isLobbyView, user, selectedCharacter?.id, fetchLobby]);

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

  return (
    <StageLayout
      logged={logged}
      isGM={isGM}
      showBackstage={showBackstage}
      stageMode={stageMode}
      curtainsOpen={shouldOpenCurtains}
      hideValance={hideValance}
      espetaculoPhase={espetaculoPhase}
      stageContent={
        show && (showPhase === "half" || showPhase === "stage") ? (
          <StageView
            room={liveKitRoom}
            showId={show.id}
            phase={showPhase}
            storyId={show.storyId}
            sceneId={show.sceneId}
            scenarioImageUrl={show.scenarioImageUrl}
            scenarioCrop={show.scenarioCrop ?? null}
            isGM={isGM}
            gmEmail={user?.email ?? null}
            lobbyParticipants={displayParticipants}
            lobbyCharacterIdsKey={lobbyCharacterIdsKeyStable}
            speakingByIdentity={speakingByIdentity}
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
        createPortal(
          <div className="espetaculo-interrupt-wrap" aria-label="Controle do espetáculo">
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              onClick={() => {
                if (!show) return;
                const msg = { type: "show/cancel", showId: show.id };
                try {
                  liveKitRoom?.localParticipant.publishData(
                    new TextEncoder().encode(JSON.stringify(msg)),
                    { reliable: true, topic: "espetaculo" }
                  );
                } catch {}
                setShow(null);
              }}
            >
              Interromper o espetáculo
            </button>
          </div>,
          document.body
        )}
      {logged && (
        <LobbyScreen
          room={liveKitRoom}
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
            !(effectiveRole === "PLAYER" && show && (showPhase === "half" || showPhase === "stage"))
          }
          onEditProfile={effectiveRole === "PLAYER" ? () => setSubView("EDIT_PROFILE") : undefined}
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
            onStartShow={(storyId, sceneId, scenarioId) => {
              const startedAt = Date.now();
              const id = String(startedAt);
              const next = { id, startedAt, storyId, sceneId, scenarioId, scenarioImageUrl: null as string | null, scenarioCrop: null as { x: number; y: number; width: number; height: number } | null };
              setShow(next);

              try {
                liveKitRoom?.localParticipant.publishData(
                  new TextEncoder().encode(JSON.stringify({ type: "show/start", showId: id, startedAt, storyId, sceneId, scenarioId, scenarioImageUrl: null, scenarioCrop: null })),
                  { reliable: true, topic: "espetaculo" }
                );
              } catch {}

              if (scenarioId) {
                (async () => {
                  try {
                    const s = await api<{ image_storage_key: string | null; crop_x?: number | null; crop_y?: number | null; crop_width?: number | null; crop_height?: number | null }>(`/api/gm/scenarios/${scenarioId}`);
                    const scenarioImageUrlRes = scenarioImageUrl(s);
                    const scenarioCropRes = scenarioCropFromScenario(s);
                    setShow((prev) => (prev && prev.id === id ? { ...prev, scenarioImageUrl: scenarioImageUrlRes, scenarioCrop: scenarioCropRes } : prev));
                    try {
                      liveKitRoom?.localParticipant.publishData(
                        new TextEncoder().encode(JSON.stringify({ type: "show/scenario", showId: id, scenarioImageUrl: scenarioImageUrlRes, scenarioCrop: scenarioCropRes })),
                        { reliable: true, topic: "espetaculo" }
                      );
                    } catch {}
                  } catch {}
                })();
              }
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
            setEditingCharacter(c);
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
          onBack={() => setSubView("LOBBY")}
          onSelect={(c) => {
            setSelectedCharacter({
              id: c.id,
              name: c.name,
              system: c.system,
              imageUrl: getAvatarUrl(c),
            });
            setSubView("LOBBY");
          }}
          onEdit={(c) => {
            setEditingCharacter(c);
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
                .slice(0, 6)
                .map((p) => {
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
                        className={"lobby-actor" + (isSpeaking ? " lobby-actor--speaking" : "")}
                        src={p.character_image_url || "/assets/jogador_default.png"}
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