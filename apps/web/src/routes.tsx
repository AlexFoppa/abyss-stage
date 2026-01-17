import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth/AuthProvider";
import { StageLayout } from "./ui/StageLayout";
import { Screen } from "./ui/Screen";
import { LoginScreen } from "./screens/LoginScreen";
import { ForceResetScreen } from "./screens/ForceResetScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { CreateCharacterScreen } from "./screens/CreateCharacterScreen";
import { SelectCharacterScreen } from "./screens/SelectCharacterScreen";


type View = "LOGIN" | "RESET" | "LOBBY" | "CREATE_CHARACTER" | "SELECT_CHARACTER";

export function Routes() {
  const { user, loading } = useAuth();
  const logged = !!user && !user.must_reset_password;
  const isGM = user?.role === "GM";
  const showBackstage = !!user && user.role === "PLAYER" && !user.must_reset_password;

  const [subView, setSubView] = useState<"LOBBY" | "CREATE_CHARACTER" | "SELECT_CHARACTER">("LOBBY");
  const [stageMode, setStageMode] = useState<"IDLE" | "ZOOM_IN">("IDLE");
  
  const [selectedCharacter, setSelectedCharacter] = useState<null | {
    id: number;
    name: string;
    system: string;
  }>(null);

  const view: View = useMemo(() => {
    if (loading) return "LOGIN";
    if (!user) return "LOGIN";
    if (user.must_reset_password) return "RESET";
    return subView;
  }, [user, loading, subView]);

  useEffect(() => {
    setStageMode(view === "CREATE_CHARACTER" ? "ZOOM_IN" : "IDLE");
  }, [view]);

  return (
    <StageLayout logged={logged} isGM={isGM} showBackstage={showBackstage} stageMode={stageMode}>
      {loading ? (
        <Screen title="Carregando…" />
      ) : view === "LOGIN" ? (
        <LoginScreen />
      ) : view === "RESET" ? (
        <ForceResetScreen />
      ) : view === "CREATE_CHARACTER" ? (
  <CreateCharacterScreen onBack={() => setSubView("LOBBY")} />
    ) : view === "SELECT_CHARACTER" ? (
      <SelectCharacterScreen
        onBack={() => setSubView("LOBBY")}
        onSelect={(c) =>
          setSelectedCharacter({ id: c.id, name: c.name, system: c.system })
        }
      />
    ) : (
      <>
        {selectedCharacter ? (
          <>
            <img
              className="lobby-actor"
              src="/assets/jogador_default.png"
              alt={selectedCharacter.name}
            />
            <div className="lobby-poster">
              <div className="lobby-poster-title">Estrelando:</div>
              <div className="lobby-poster-name">{selectedCharacter.name}</div>
            </div>
          </>
        ) : null}

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
