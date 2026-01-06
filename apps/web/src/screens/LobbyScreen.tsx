// src/screens/LobbyScreen.tsx
import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { joinRoom } from "../rtc/livekit";
import { Screen } from "../routes";

export function LobbyScreen() {
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
