import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { RoomEvent, ParticipantEvent, Track, type Room, type Participant } from "livekit-client";
import { useAuth } from "./auth/AuthProvider";
import { api } from "./api";
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

type View =
  | "LOGIN"
  | "RESET"
  | "GM_HOME"
  | "GM_CHARACTERS"
  | "GM_SCENARIOS"
  | "GM_STORIES"
  | "GM_STORY_EDITOR"
  | "LOBBY"
  | "CREATE_CHARACTER"
  | "SELECT_CHARACTER"
  | "EDIT_CHARACTER";

export function Routes() {
  const { user, loading, viewMode, setViewMode, logout } = useAuth();
  
  const logged = !!user && !user.must_reset_password;
  const isGM = user?.role === "GM";
  
  const effectiveRole = isGM && viewMode === "PLAYER" ? "PLAYER" : user?.role;
  const showBackstage = !!user && effectiveRole === "PLAYER" && !user.must_reset_password;

  const [subView, setSubView] = useState<
    "LOBBY" | "CREATE_CHARACTER" | "SELECT_CHARACTER" | "EDIT_CHARACTER"
  >("LOBBY");

  const [gmSubView, setGmSubView] = useState<"GM_HOME" | "GM_CHARACTERS" | "GM_SCENARIOS" | "GM_STORIES" | "GM_STORY_EDITOR">("GM_HOME");
  const [editingStoryId, setEditingStoryId] = useState<string | null>(null);
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

  const [liveKitRoom, setLiveKitRoom] = useState<Room | null>(null);
  const [masterSpeaking, setMasterSpeaking] = useState(false);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [speakingByIdentity, setSpeakingByIdentity] = useState<Record<string, boolean>>({});

  const [lobbyParticipants, setLobbyParticipants] = useState<LobbyParticipant[]>([]);
  const [actorOffsets, setActorOffsets] = useState<Record<string, number>>({});
  const actorDragRef = useRef<{ identity: string; startX: number; startOffset: number } | null>(null);

  const view: View = useMemo(() => {
    if (loading) return "LOGIN";
    if (!user) return "LOGIN";
    if (user.must_reset_password) return "RESET";
    if (subView === "CREATE_CHARACTER" || subView === "EDIT_CHARACTER") return subView;

    if (effectiveRole === "GM") return gmSubView;
    return subView;
  }, [user, loading, subView, effectiveRole, gmSubView]);

  useEffect(() => {
    setStageMode(view === "CREATE_CHARACTER" || view === "EDIT_CHARACTER" ? "ZOOM_IN" : "IDLE");
  }, [view]);

  useEffect(() => {
    if (!liveKitRoom) return;

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
        if (identity === "gm") setMasterSpeaking(speaking);
        updateSpeaking(identity, speaking);
      };
      p.on(ParticipantEvent.IsSpeakingChanged, handler);
      handler();
      unsubs.push(() => p.off(ParticipantEvent.IsSpeakingChanged, handler));
    };
    liveKitRoom.remoteParticipants.forEach(subscribeSpeaking);
    const onParticipantConnected = (p: Participant) => subscribeSpeaking(p);
    liveKitRoom.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    const onParticipantDisconnected = (p: Participant) => {
      setSpeakingByIdentity((prev) => {
        const next = { ...prev };
        delete next[p.identity];
        return next;
      });
    };
    liveKitRoom.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);

    return () => {
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

  useEffect(() => {
    if (!isLobbyView || !user) return;
    fetchLobby();
    const intervalMs = 2000;
    const t = setInterval(fetchLobby, intervalMs);
    return () => clearInterval(t);
  }, [isLobbyView, user, fetchLobby]);

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

  function getPortraitUrl(c: any) {
    if (!c.default_image_url) return "/assets/jogador_default.png";
    if (c.default_image_rev) return `${c.default_image_url}?rev=${c.default_image_rev}`;
    return c.default_image_url;
  }

  const shouldOpenCurtains = isGM && !["LOBBY", "SELECT_CHARACTER", "CREATE_CHARACTER", "EDIT_CHARACTER"].includes(view);
  const isGMView = isGM && ["GM_HOME", "GM_CHARACTERS", "GM_SCENARIOS", "GM_STORIES", "GM_STORY_EDITOR"].includes(view);

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
              ? [{ user_id: isGM ? user!.id : 0, identity: "gm", is_gm: true, character_id: null, character_name: null, character_image_url: null }]
              : []),
            ...(selectedCharacter && !isGM
              ? [
                  {
                    user_id: user!.id,
                    identity: `player-${user!.id}`,
                    is_gm: false,
                    character_id: selectedCharacter.id,
                    character_name: selectedCharacter.name,
                    character_image_url: selectedCharacter.imageUrl ?? null,
                  },
                ]
              : []),
          ]
        : [];
  // Garantir que o mestre apareça sempre na visão do lobby quando o usuário é GM (evita sumir com atraso/API vazia).
  const displayParticipants: LobbyParticipant[] =
    view === "LOBBY" && user && isGM && !baseParticipants.some((p) => p.is_gm)
      ? [{ user_id: user.id, identity: "gm", is_gm: true, character_id: null, character_name: null, character_image_url: null }, ...baseParticipants]
      : baseParticipants;

  return (
    <StageLayout
      logged={logged}
      isGM={isGM}
      showBackstage={showBackstage}
      stageMode={stageMode}
      curtainsOpen={shouldOpenCurtains}
      hideValance={isGMView}
    >
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
          onLogout={() => logout()}
        />
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
            onBack={() => {
              setGmSubView("GM_STORIES");
              setEditingStoryId(null);
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
            setEditingFromGM(true);
            setSubView("CREATE_CHARACTER");
          }}
        />
      ) : view === "CREATE_CHARACTER" ? (
        <CreateCharacterScreen
          scope={editingFromGM ? "GM" : "ME"}
          onBack={() => {
            if (editingFromGM) {
              setSubView("LOBBY");
              setGmSubView(editingReturnGmView ?? "GM_CHARACTERS");
              setEditingReturnGmView(null);
              setEditingFromGM(false);
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
              imageUrl: getPortraitUrl(c),
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
      ) : (
        <>
          <div className="lobby-stage">
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
            <div className="lobby-actors">
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
                        alt={p.character_name ?? "Personagem"}
                        draggable={false}
                      />
                    </div>
                  );
                })}
            </div>
          </div>

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
          />
        </>
      )}
    </StageLayout>
  );
}