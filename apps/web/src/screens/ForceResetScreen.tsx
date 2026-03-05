// src/screens/ForceResetScreen.tsx
import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { Screen } from "../ui/Screen";

export function ForceResetScreen() {
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
        Logado como <b>{user?.name?.trim() || user?.email}</b>
      </div>

     <form onSubmit={onSubmit} className="ui-stack">
        <label className="ui-label">
          Senha atual
          <input
            className="ui-field"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
          />
        </label>

        <label className="ui-label">
          Nova senha
          <input
            className="ui-field"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            type="password"
            autoComplete="new-password"
          />
        </label>

        {err && <div style={{ color: "crimson" }}>{err}</div>}
        {ok && <div style={{ color: "green" }}>{ok}</div>}

        <button className="ui-btn" disabled={busy} type="submit">
          {busy ? "Salvando…" : "Salvar nova senha"}
        </button>

        <button className="ui-btn ui-btn--ghost" type="button" onClick={logout}>
          Sair
        </button>
      </form>

    </Screen>
  );
}
