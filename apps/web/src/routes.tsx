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

type View =
  | "LOGIN"
  | "RESET"
  | "GM_HOME"
  | "LOBBY"
  | "CREATE_CHARACTER"
  | "SELECT_CHARACTER"
  | "EDIT_CHARACTER";

export function Routes() {
  const { user, loading, gmView } = useAuth();
  const logged = !!user && !user.must_reset_password;
  const isGM = user?.role === "GM";
  const effectiveRole = isGM && gmView === "PLAYER" ? "PLAYER" : user?.role;
  const showBackstage = !!user && effectiveRole === "PLAYER" && !user.must_reset_password;


  const [subView, setSubView] = useState<
    "LOBBY" | "CREATE_CHARACTER" | "SELECT_CHARACTER" | "EDIT_CHARACTER"
  >("LOBBY");

  const [stageMode, setStageMode] = useState<"IDLE" | "ZOOM_IN">("IDLE");
  
  const [selectedCharacter, setSelectedCharacter] = useState<null | {
    id: number;
    name: string;
    system: string;
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

  const view: View = useMemo(() => {
    if (loading) return "LOGIN";
    if (!user) return "LOGIN";
    if (user.must_reset_password) return "RESET";
    if (effectiveRole === "GM") return "GM_HOME";
    return subView;
  }, [user, loading, subView, effectiveRole]);


  useEffect(() => {
    setStageMode(view === "CREATE_CHARACTER" || view === "EDIT_CHARACTER" ? "ZOOM_IN" : "IDLE");
  }, [view]);

  return (
  <StageLayout
    logged={logged}
    isGM={isGM}
    showBackstage={showBackstage}
    stageMode={stageMode}
  >
    {loading ? (
      <Screen title="Carregando…" />
    ) : view === "LOGIN" ? (
      <LoginScreen />
    ) : view === "RESET" ? (
      <ForceResetScreen />
    ) : view === "GM_HOME" ? (
      <HomeGMScreen />
    ) : view === "CREATE_CHARACTER" ? (
      <CreateCharacterScreen
        onBack={() => setSubView("LOBBY")}
      />
    ) : view === "SELECT_CHARACTER" ? (
      <SelectCharacterScreen
        onBack={() => setSubView("LOBBY")}
        onSelect={(c) => {
          setSelectedCharacter({
            id: c.id,
            name: c.name,
            system: c.system,
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
        character={editingCharacter}
        onBack={() => {
          setEditingCharacter(null);
          setSubView("SELECT_CHARACTER");
        }}
      />
    ) : (
      <>
        {selectedCharacter && (
          <>
            <img
              className="lobby-actor"
              src="/assets/jogador_default.png"
              alt={selectedCharacter.name}
            />
            <div className="lobby-poster">
              <div className="lobby-poster-title">Estrelando:</div>
              <div className="lobby-poster-name">
                {selectedCharacter.name}
              </div>
            </div>
          </>
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
