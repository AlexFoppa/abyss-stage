// src/routes.tsx
import { useMemo } from "react";
import { useAuth } from "./auth/AuthProvider";
import { StageLayout } from "./ui/StageLayout";
import { LoginScreen } from "./screens/LoginScreen";
import { ForceResetScreen } from "./screens/ForceResetScreen";
import { LobbyScreen } from "./screens/LobbyScreen";

type View = "LOGIN" | "RESET" | "LOBBY";

export function Routes() {
  const { user, loading } = useAuth();
  const logged = !!user && !user.must_reset_password;
  const isGM = user?.role === "GM";
  const showBackstage = !!user && user.role === "PLAYER" && !user.must_reset_password;

  const view: View = useMemo(() => {
    if (loading) return "LOGIN";
    if (!user) return "LOGIN";
    if (user.must_reset_password) return "RESET";
    return "LOBBY";
  }, [user, loading]);

  return (
    <StageLayout logged={logged} isGM={isGM} showBackstage={showBackstage}>
      {loading ? (
        <Screen title="Carregando…" />
      ) : view === "LOGIN" ? (
        <LoginScreen />
      ) : view === "RESET" ? (
        <ForceResetScreen />
      ) : (
        <LobbyScreen />
      )}
    </StageLayout>
  );
}

export function Screen({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="panel">
      <h1>Abyss Stage</h1>
      <div
        style={{
          textAlign: "center",
          letterSpacing: ".14em",
          textTransform: "uppercase",
          opacity: 0.85,
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
