// src/screens/LoginScreen.tsx
import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { Screen } from "../ui/Screen";

export function LoginScreen() {
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
    if (mode === "register" && name.trim().length < 2) {
      setErr("Nome muito curto.");
      return;
    }
    if (pw.length < 8) {
      setErr("A senha deve ter pelo menos 8 caracteres.");
      return;
    }

    setBusy(true);

    if (mode === "register") {
      try {
        await api("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            email: em,
            password: pw,
          }),
        });
      } catch (e: any) {
        const msg = e?.detail?.[0]?.msg || e?.message || "Dados inválidos.";
        setErr("Cadastro: " + msg);
        setBusy(false);
        return;
      }
    }

    try {
      await login(em, pw);
    } catch (e: any) {
      setErr("Login: " + (e?.message || "falhou"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={mode === "login" ? "Entrar" : "Criar conta"}>
      <form onSubmit={onSubmit} className="ui-stack">
        {mode === "register" && (
          <label className="ui-label">
            Nome
            <input
              className="ui-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              minLength={2}
              required
            />
          </label>
        )}

        <label className="ui-label">
          Email
          <input
            className="ui-field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            autoComplete="email"
          />
        </label>

        <label className="ui-label">
          Senha
          <input
            className="ui-field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={8}
            required
          />
        </label>

        {err && <div style={{ color: "crimson" }}>{err}</div>}

        <button className="ui-btn" disabled={busy} type="submit">
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
