// src/routes.tsx
import { useMemo, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth/AuthProvider";
import { joinRoom } from "./rtc/livekit";
import { StageLayout } from "./ui/StageLayout";

type View = "LOGIN" | "RESET" | "LOBBY";

export function Routes() {
  const { user, loading } = useAuth();
  const logged = !!user && !user.must_reset_password;

  const view: View = useMemo(() => {
    if (loading) return "LOGIN";
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

function Screen({ title, children }: { title: string; children?: React.ReactNode }) {
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

function LoginScreen() {
  const { login } = useAuth();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    
    const em = email.trim();
    const pw = password;

    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setErr("Email inválido.");
      return;
    }

    if (mode === "register" && name.trim().length < 2) return setErr("Nome muito curto.");
    if (pw.length < 8) return setErr("A senha deve ter pelo menos 8 caracteres.");
  
    setBusy(true);

    if (mode === "register") {
      try {
        await api("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            password,
          }),
        });
      } catch (e: any) {
        const msg =
          e?.detail?.[0]?.msg ||
          e?.message ||
          "Dados inválidos.";
        setErr("Cadastro: " + msg);
        setBusy(false);
        return;
      }
    }

    try {
      await login(email.trim(), password);
    } catch (e: any) {
      setErr("Login: " + (e?.message || "falhou"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={mode === "login" ? "Entrar" : "Criar conta"}>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        {mode === "register" && (
          <label>
            Nome
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: "100%" }}
              autoComplete="name"
              minLength={2}
              required
            />
          </label>
        )}

        <label>
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            style={{ width: "100%" }}
            autoComplete="email"
          />
        </label>

        <label>
          Senha
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            style={{ width: "100%" }}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={8}
            required
          />
        </label>

        {err && <div style={{ color: "crimson" }}>{err}</div>}

        <button disabled={busy} type="submit">
          {busy ? "Processando…" : mode === "login" ? "Entrar" : "Criar conta"}
        </button>

        <button
          type="button"
          className="link"
          onClick={() => {
            setErr(null);
            setMode((m) => (m === "login" ? "register" : "login"));
          }}
        >
          {mode === "login" ? "Criar conta" : "Já tenho conta"}
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
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
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
            autoComplete="current-password"
          />
        </label>

        <label>
          Nova senha
          <input
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            type="password"
            style={{ width: "100%" }}
            autoComplete="new-password"
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
