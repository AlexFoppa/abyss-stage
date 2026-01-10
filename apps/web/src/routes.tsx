import { useMemo, useState } from "react";
import { useAuth } from "./auth/AuthProvider";
import { StageLayout } from "./ui/StageLayout";
import { Screen } from "./ui/Screen";
import { LoginScreen } from "./screens/LoginScreen";
import { ForceResetScreen } from "./screens/ForceResetScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { CreateCharacterScreen } from "./screens/CreateCharacterScreen";

type View = "LOGIN" | "RESET" | "LOBBY" | "CREATE_CHARACTER";

export function Routes() {
  const { user, loading } = useAuth();
  const logged = !!user && !user.must_reset_password;
  const isGM = user?.role === "GM";
  const showBackstage = !!user && user.role === "PLAYER" && !user.must_reset_password;

  const [subView, setSubView] = useState<"LOBBY" | "CREATE_CHARACTER">("LOBBY");

  const view: View = useMemo(() => {
    if (loading) return "LOGIN";
    if (!user) return "LOGIN";
    if (user.must_reset_password) return "RESET";
    return subView;
  }, [user, loading, subView]);

  return (
    <StageLayout logged={logged} isGM={isGM} showBackstage={showBackstage}>
      {loading ? (
        <Screen title="Carregando…" />
      ) : view === "LOGIN" ? (
        <LoginScreen />
      ) : view === "RESET" ? (
        <ForceResetScreen />
      ) : view === "CREATE_CHARACTER" ? (
        <CreateCharacterScreen onBack={() => setSubView("LOBBY")} />
      ) : (
        <LobbyScreen onCreateCharacter={() => setSubView("CREATE_CHARACTER")} />
      )}
    </StageLayout>
  );
}
