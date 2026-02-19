import { useEffect, useMemo, useState } from "react";
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
import { StoryListScreen } from "./screens/StoryListScreen";
import { StoryEditorScreen } from "./screens/StoryEditorScreen";

type View =
  | "LOGIN"
  | "RESET"
  | "GM_HOME"
  | "GM_CHARACTERS"
  | "GM_STORIES"
  | "GM_STORY_EDITOR"
  | "LOBBY"
  | "CREATE_CHARACTER"
  | "SELECT_CHARACTER"
  | "EDIT_CHARACTER";

export function Routes() {
  const { user, loading, viewMode, logout } = useAuth();
  
  const logged = !!user && !user.must_reset_password;
  const isGM = user?.role === "GM";
  
  const effectiveRole = isGM && viewMode === "PLAYER" ? "PLAYER" : user?.role;
  const showBackstage = !!user && effectiveRole === "PLAYER" && !user.must_reset_password;

  const [subView, setSubView] = useState<
    "LOBBY" | "CREATE_CHARACTER" | "SELECT_CHARACTER" | "EDIT_CHARACTER"
  >("LOBBY");

  const [gmSubView, setGmSubView] = useState<"GM_HOME" | "GM_CHARACTERS" | "GM_STORIES" | "GM_STORY_EDITOR">("GM_HOME");
  const [editingStoryId, setEditingStoryId] = useState<string | null>(null);
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

  function getPortraitUrl(c: any) {
    if (!c.default_image_url) return "/assets/jogador_default.png";
    if (c.default_image_rev) return `${c.default_image_url}?rev=${c.default_image_rev}`;
    return c.default_image_url;
  }

  const shouldOpenCurtains = isGM && !["LOBBY", "SELECT_CHARACTER", "CREATE_CHARACTER", "EDIT_CHARACTER"].includes(view);

  return (
    <StageLayout
      logged={logged}
      isGM={isGM}
      showBackstage={showBackstage}
      stageMode={stageMode}
      curtainsOpen={shouldOpenCurtains}
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
      ) : view === "GM_CHARACTERS" ? (
        <GMCharactersScreen
          onBack={() => setGmSubView("GM_HOME")}
          onEdit={(c) => {
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
              setGmSubView("GM_CHARACTERS");
              setEditingFromGM(false);
              return;
            }
            setSubView("LOBBY");
          }}
          onCreated={() => {
            if (editingFromGM) {
              setSubView("LOBBY");
              setGmSubView("GM_CHARACTERS");
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
              setSubView("LOBBY");
              setGmSubView("GM_CHARACTERS");
              setEditingFromGM(false);
              return;
            }
            setSubView("SELECT_CHARACTER");
          }}
        />
      ) : (
        <>
          {selectedCharacter && (
            <img
              className="lobby-actor"
              src={selectedCharacter.imageUrl || "/assets/jogador_default.png"}
              alt={selectedCharacter.name}
            />
          )}

          <LobbyScreen
            selectedCharacter={selectedCharacter}
            onSelectCharacter={() => setSubView("SELECT_CHARACTER")}
            onCreateCharacter={() => {
              setStageMode("ZOOM_IN");
              setSubView("CREATE_CHARACTER");
            }}
          />
        </>
      )}
    </StageLayout>
  );
}