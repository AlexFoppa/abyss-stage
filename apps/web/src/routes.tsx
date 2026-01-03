// src/routes.tsx
import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth/AuthProvider";
import { joinRoom } from "./rtc/livekit";
import { StageLayout } from "./ui/StageLayout";


type View = "LOGIN" | "RESET" | "LOBBY";

export function Routes() {
  const { user, loading } = useAuth();
  const logged = !!user && !user.must_reset_password;


  const view: View = useMemo(() => {
    if (loading) return "LOGIN"; // placeholder; tela de loading abaixo
    if (!user) return "LOGIN";
    if (user.must_reset_password) return "RESET";
    return "LOBBY";
  }, [user, loading]);

return (
  <StageLayout logged={logged}>
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

function Screen({ title, children }: { title: string; children?: any }) {
  return (
    <div style={{ maxWidth: 420, margin: "48px auto", padding: 16 }}>
      <h1 style={{ marginBottom: 16 }}>{title}</h1>
      {children}
    </div>
  );
}

function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("gm@example.com");
  const [password, setPassword] = useState("SenhaForte123");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (e: any) {
      setErr(e?.message || "Falha no login");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Entrar">
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%" }} />
        </label>
        <label>
          Senha
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            style={{ width: "100%" }}
          />
        </label>
        {err && <div style={{ color: "crimson" }}>{err}</div>}
        <button disabled={busy} type="submit">
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </Screen>
  );
}

function ForceResetScreen() {
  const { user, refreshMe, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    setBusy(true);
    try {
      await api("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      await refreshMe();
      setOk("Senha atualizada.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (e: any) {
      setErr(e?.message || "Falha ao trocar senha");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Troca de senha obrigatória">
      <div style={{ marginBottom: 12, opacity: 0.8 }}>
        Logado como <b>{user?.email}</b>
      </div>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label>
          Senha atual
          <input
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            type="password"
            style={{ width: "100%" }}
          />
        </label>
        <label>
          Nova senha
          <input
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            type="password"
            style={{ width: "100%" }}
          />
        </label>
        {err && <div style={{ color: "crimson" }}>{err}</div>}
        {ok && <div style={{ color: "green" }}>{ok}</div>}
        <button disabled={busy} type="submit">
          {busy ? "Salvando…" : "Salvar nova senha"}
        </button>
        <button type="button" onClick={logout}>
          Sair
        </button>
      </form>
    </Screen>
  );
}

function LobbyScreen() {
  const { user, logout } = useAuth();
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  async function connectAudio() {
    setErr(null);
    setStatus("connecting");
    try {
      const { token } = await api<{ token: string }>("/api/token?room=test");
      await joinRoom(token, "ws://127.0.0.1:7880");
      setStatus("connected");
    } catch (e: any) {
      setStatus("error");
      setErr(e?.message || "Falha ao conectar áudio");
    }
  }

  return (
    <Screen title="Lobby">
      <div style={{ marginBottom: 12, opacity: 0.8 }}>
        {user?.name} — {user?.role}
      </div>

      <button disabled={status === "connecting" || status === "connected"} onClick={connectAudio}>
        {status === "connected" ? "Áudio conectado" : status === "connecting" ? "Conectando…" : "Conectar áudio"}
      </button>

      {err && <div style={{ color: "crimson", marginTop: 12 }}>{err}</div>}

      <div style={{ marginTop: 16 }}>
        <button onClick={logout}>Sair</button>
      </div>
    </Screen>
  );
}
