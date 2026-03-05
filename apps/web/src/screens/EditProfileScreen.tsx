// src/screens/EditProfileScreen.tsx
import { useState, useEffect } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { Screen } from "../ui/Screen";

export function EditProfileScreen({ onBack }: { onBack: () => void }) {
  const { user, refreshMe } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
  }, [user?.name, user?.email]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const nameValue = name.trim();
      const emailValue = email.trim().toLowerCase();
      if (nameValue.length < 1 || nameValue.length > 80) {
        setErr("O nome deve ter entre 1 e 80 caracteres.");
        setBusy(false);
        return;
      }
      if (!emailValue || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
        setErr("Informe um e-mail válido.");
        setBusy(false);
        return;
      }
      await api<{ id: number; name: string; email: string }>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ name: nameValue, email: emailValue }),
      });
      await refreshMe();
      onBack();
    } catch (e: unknown) {
      const msg =
        e && typeof (e as { message?: string }).message === "string"
          ? (e as { message: string }).message
          : "Falha ao salvar.";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Meu perfil">
      <form onSubmit={onSubmit} className="ui-stack">
        <label className="ui-label">
          Nome
          <input
            className="ui-field"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Seu nome de exibição"
            minLength={1}
            maxLength={80}
            autoComplete="name"
          />
        </label>
        <label className="ui-label">
          E-mail
          <input
            className="ui-field"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            autoComplete="email"
          />
        </label>
        {err && <div style={{ color: "crimson" }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="ui-btn" disabled={busy} type="submit">
            {busy ? "Salvando…" : "Salvar"}
          </button>
          <button className="ui-btn ui-btn--ghost" type="button" onClick={onBack}>
            Voltar
          </button>
        </div>
      </form>
    </Screen>
  );
}
