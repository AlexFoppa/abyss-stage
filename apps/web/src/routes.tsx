import { useEffect, useMemo, useState } from "react";
import { RoomEvent, ParticipantEvent, Track, type Room, type Participant } from "livekit-client";
import { useAuth } from "./auth/AuthProvider";
import { StageLayout } from "./ui/StageLayout";
import { Screen } from "./ui/Screen";
import { LoginScreen } from "./screens/LoginScreen";
import { ForceResetScreen } from "./screens/ForceResetScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
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

    const onLocalSpeaking = () => setLocalSpeaking(liveKitRoom.localParticipant.isSpeaking);
    liveKitRoom.localParticipant.on(ParticipantEvent.IsSpeakingChanged, onLocalSpeaking);
    setLocalSpeaking(liveKitRoom.localParticipant.isSpeaking);

    let gmSpeakingHandler: (() => void) | null = null;
    const subscribeGmSpeaking = (p: Participant) => {
      gmSpeakingHandler = () => setMasterSpeaking(p.isSpeaking);
      p.on(ParticipantEvent.IsSpeakingChanged, gmSpeakingHandler);
      setMasterSpeaking(p.isSpeaking);
    };

    const gmParticipant = liveKitRoom.localParticipant.identity === "gm"
      ? liveKitRoom.localParticipant
      : Array.from(liveKitRoom.remoteParticipants.values()).find((p) => p.identity === "gm");
    if (gmParticipant) subscribeGmSpeaking(gmParticipant);

    const onParticipantConnected = (p: Participant) => {
      if (p.identity === "gm") subscribeGmSpeaking(p);
    };
    liveKitRoom.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    liveKitRoom.remoteParticipants.forEach((p) => onParticipantConnected(p));

    return () => {
      liveKitRoom.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
      liveKitRoom.localParticipant.off(ParticipantEvent.IsSpeakingChanged, onLocalSpeaking);
      liveKitRoom.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      if (gmParticipant && gmSpeakingHandler) {
        gmParticipant.off(ParticipantEvent.IsSpeakingChanged, gmSpeakingHandler);
      }
      liveKitRoom.remoteParticipants.forEach((p) => {
        if (p.identity === "gm") p.removeAllListeners(ParticipantEvent.IsSpeakingChanged);
      });
    };
  }, [liveKitRoom]);

  useEffect(() => {
    if (!logged && liveKitRoom) {
      liveKitRoom.disconnect();
      setLiveKitRoom(null);
    }
  }, [logged, liveKitRoom]);

  function getPortraitUrl(c: any) {
    if (!c.default_image_url) return "/assets/jogador_default.png";
    if (c.default_image_rev) return `${c.default_image_url}?rev=${c.default_image_rev}`;
    return c.default_image_url;
  }

  const shouldOpenCurtains = isGM && !["LOBBY", "SELECT_CHARACTER", "CREATE_CHARACTER", "EDIT_CHARACTER"].includes(view);
  const isGMView = isGM && ["GM_HOME", "GM_CHARACTERS", "GM_SCENARIOS", "GM_STORIES", "GM_STORY_EDITOR"].includes(view);

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
          <img
            className={"lobby-master" + (masterSpeaking ? " lobby-master--speaking" : "")}
            src="/assets/jogador_default.png"
            alt="Mestre"
            aria-label="Mestre"
          />
          {selectedCharacter && (
            <img
              className={"lobby-actor" + (localSpeaking ? " lobby-actor--speaking" : "")}
              src={selectedCharacter.imageUrl || "/assets/jogador_default.png"}
              alt={selectedCharacter.name}
            />
          )}

          <LobbyScreen
            room={liveKitRoom}
            selectedCharacter={selectedCharacter}
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