// apps/web/src/screens/LobbyScreen.tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { Room } from "livekit-client";
import { api } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { joinRoom } from "../rtc/livekit";

const MIC_TOOLTIP_DENIED =
  "Microfone bloqueado. Clique no ícone de cadeado (ou «i») na barra de endereço e permita o uso do microfone para este site.";

function friendlyAudioError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("pc connection") || lower.includes("establish") || lower.includes("ice") || lower.includes("webrtc")) {
    return "Não foi possível conectar o áudio. Verifique: (1) túnel e LiveKit ativos no servidor, (2) URL do LiveKit (wss://...) correta na API, (3) atualize a página e permita o microfone quando o navegador pedir.";
  }
  return message;
}

export type DiagnosticStep = { step: number; label: string; ok: boolean; detail?: string };

/** Testa em etapas: (1) token/URL, (2) WebSocket até o LiveKit, (3) conexão completa. Identifica se o problema é URL/túnel ou WebRTC/NAT. */
export async function runAudioDiagnostic(): Promise<DiagnosticStep[]> {
  const steps: DiagnosticStep[] = [];
  let token = "";
  let wsUrl = "";

  try {
    const res = await api<{ token: string; url?: string }>("/api/token?room=lobby");
    token = res.token;
    wsUrl = (res.url ?? "ws://127.0.0.1:7880").trim().replace(/^http/, "ws");
    const keyHint = (res as { key_preview?: string }).key_preview;
    steps.push({
      step: 1,
      label: "Token e URL obtidos",
      ok: true,
      detail: keyHint ? `${wsUrl} (API Key: ${keyHint})` : wsUrl,
    });
  } catch (e) {
    const msg = e && typeof (e as { message?: string }).message === "string" ? (e as { message: string }).message : String(e);
    steps.push({ step: 1, label: "Falha ao obter token/URL", ok: false, detail: msg });
    return steps;
  }

  // LiveKit Cloud: não testar WebSocket bruto (o servidor pode exigir handshake do cliente). Ir direto ao passo 3.
  const isLiveKitCloud = /\.livekit\.cloud$/i.test(wsUrl.replace(/^http/, "ws"));
  if (!isLiveKitCloud) {
    const rtcUrl = (() => {
      const u = new URL(wsUrl.replace(/^http/, "ws"));
      if (!u.pathname || u.pathname === "/") u.pathname = "/rtc";
      else if (!u.pathname.endsWith("/rtc")) u.pathname = u.pathname.replace(/\/?$/, "") + "/rtc";
      u.searchParams.set("access_token", token);
      return u.toString();
    })();
    const wsOk = await new Promise<boolean>((resolve) => {
      const ws = new WebSocket(rtcUrl);
      const t = setTimeout(() => {
        try {
          ws.close();
        } catch {}
        resolve(false);
      }, 12000);
      ws.onopen = () => {
        clearTimeout(t);
        try {
          ws.close();
        } catch {}
        resolve(true);
      };
      ws.onerror = () => {
        clearTimeout(t);
        resolve(false);
      };
      ws.onclose = () => {
        clearTimeout(t);
        resolve(false);
      };
    });
    if (wsOk) {
      steps.push({ step: 2, label: "WebSocket até o LiveKit: acessível", ok: true });
    } else {
      steps.push({
        step: 2,
        label: "WebSocket até o LiveKit: inacessível",
        ok: false,
        detail: `URL/túnel inacessível. URL: ${wsUrl}. Confira o túnel 7880 e LIVEKIT_WS_URL na API.`,
      });
      return steps;
    }
  } else {
    steps.push({
      step: 2,
      label: "WebSocket até o LiveKit: LiveKit Cloud (teste omitido)",
      ok: true,
      detail: "Usando LiveKit Cloud; teste de WebSocket bruto não aplicável.",
    });
  }

  try {
    const room = new Room({ adaptiveStream: true, dynacast: true });
    await room.connect(wsUrl, token, {
      rtcConfig: { iceTransportPolicy: "relay" },
    });
    await room.localParticipant.setMicrophoneEnabled(true);
    await room.disconnect();
    steps.push({ step: 3, label: "Conexão completa (LiveKit + mídia): OK", ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const lower = msg.toLowerCase();
    const likelyWebRTC = lower.includes("pc connection") || lower.includes("establish") || lower.includes("ice") || lower.includes("webrtc");
    const detailWebRTC = isLiveKitCloud
      ? "WebSocket OK, mas a mídia não conectou (TURN/relay). Rede/firewall pode bloquear. Erro: "
      : "WebSocket chegou, mas a mídia não. Use LiveKit Cloud (docs/audio-livekit-cloud.md). Erro: ";
    steps.push({
      step: 3,
      label: likelyWebRTC ? "Falha na mídia (WebRTC)" : "Falha na conexão LiveKit",
      ok: false,
      detail: (likelyWebRTC ? detailWebRTC : "") + msg,
    });
  }

  return steps;
}

export function LobbyScreen({
  onCreateCharacter,
  onSelectCharacter,
  selectedCharacter,
  onRoomConnected,
}: {
  onCreateCharacter: () => void;
  onSelectCharacter: () => void;
  selectedCharacter: null | { id: number; name: string; system: string };
  onRoomConnected?: (room: Room) => void;
}) {
  const { logout } = useAuth();
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [lastLiveKitUrl, setLastLiveKitUrl] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(true);
  const [micPermission, setMicPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const [diagnosticRunning, setDiagnosticRunning] = useState(false);
  const [diagnosticSteps, setDiagnosticSteps] = useState<DiagnosticStep[] | null>(null);

  const runDiagnostic = useCallback(async () => {
    setDiagnosticRunning(true);
    setDiagnosticSteps(null);
    try {
      const steps = await runAudioDiagnostic();
      setDiagnosticSteps(steps);
    } finally {
      setDiagnosticRunning(false);
    }
  }, []);

  const connectAudio = useCallback(async () => {
    setErr(null);
    setStatus("connecting");
    setLastLiveKitUrl(null);
    try {
      const res = await api<{ token: string; url?: string }>("/api/token?room=lobby");
      const wsUrl = (res.url ?? "ws://127.0.0.1:7880").trim().replace(/^http/, "ws");
      setLastLiveKitUrl(wsUrl);
      const room = await joinRoom(res.token, wsUrl);
      setStatus("connected");
      setMicPermission("granted");
      onRoomConnected?.(room);
    } catch (e: unknown) {
      setStatus("error");
      const msg = e && typeof (e as { message?: string }).message === "string" ? (e as { message: string }).message : "Falha ao conectar áudio";
      setErr(friendlyAudioError(msg));
      if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("denied") || msg.toLowerCase().includes("not allowed")) {
        setMicPermission("denied");
      }
    }
  }, [onRoomConnected]);

  const didAutoConnect = useRef(false);
  useEffect(() => {
    if (didAutoConnect.current) return;
    didAutoConnect.current = true;
    const t = setTimeout(() => connectAudio(), 600);
    return () => clearTimeout(t);
  }, [connectAudio]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    navigator.permissions.query({ name: "microphone" as PermissionDescriptor["name"] }).then(
      (result) => {
        setMicPermission(result.state === "granted" ? "granted" : result.state === "denied" ? "denied" : "unknown");
        result.onchange = () => setMicPermission(result.state === "granted" ? "granted" : result.state === "denied" ? "denied" : "unknown");
      },
      () => {}
    );
  }, []);

  const audioTooltip = micPermission === "denied" ? MIC_TOOLTIP_DENIED : status === "error" && err ? err : undefined;

  return (
    <div className="lobby-wrap">
      {selectedCharacter ? (
        <div className="lobby-wall-poster" aria-label="Poster do personagem selecionado">
          <div className="lobby-wall-poster__kicker">Estrelando:</div>
          <div className="lobby-wall-poster__name">{selectedCharacter.name}</div>
        </div>
      ) : null}

      <div className="lobby-cabinet">
        <button
          type="button"
          className="lobby-arrow"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Recolher menu" : "Abrir menu"}
        >
          {menuOpen ? "▼" : "▶"}
        </button>

        <div className={"lobby-drawer" + (menuOpen ? " lobby-drawer--open" : "")} aria-hidden={!menuOpen}>
          <div className="lobby-actions ui-stack" style={{ gap: 10 }}>
            <button className="ui-btn" onClick={onSelectCharacter} title="Escolher o personagem para esta sessão">
              Selecionar personagem
            </button>

            <button className="ui-btn" onClick={onCreateCharacter} title="Criar um novo personagem">
              Criar personagem
            </button>

            <button
              className="ui-btn lobby-btn-audio"
              disabled={status === "connecting" || status === "connected"}
              onClick={connectAudio}
              title={audioTooltip}
              aria-describedby={audioTooltip ? "lobby-audio-hint" : undefined}
            >
              {status === "connecting" && "Conectando…"}
              {status === "connected" && "Áudio ativo"}
              {status !== "connecting" && status !== "connected" && "Compartilhar áudio"}
            </button>
            {micPermission === "denied" && (
              <p id="lobby-audio-hint" className="lobby-permission-hint" role="status">
                {MIC_TOOLTIP_DENIED}
              </p>
            )}

            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              disabled={diagnosticRunning}
              onClick={runDiagnostic}
              title="Identifica se o problema é URL/túnel ou rede (WebRTC/NAT)"
            >
              {diagnosticRunning ? "Diagnosticando…" : "Diagnosticar conexão de áudio"}
            </button>

            {diagnosticSteps && diagnosticSteps.length > 0 && (
              <div className="lobby-diagnostic" role="status">
                <strong>Diagnóstico:</strong>
                <ul>
                  {diagnosticSteps.map((s) => (
                    <li key={s.step} className={s.ok ? "lobby-diagnostic--ok" : "lobby-diagnostic--fail"}>
                      {s.step}. {s.label}
                      {s.detail && <span className="lobby-diagnostic-detail"> — {s.detail}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button className="ui-btn" disabled title="Em breve">
              Informações do jogador
            </button>

            <button className="ui-btn ui-btn--ghost" onClick={logout} title="Encerrar sessão">
              Se retirar
            </button>
          </div>
        </div>

        {err && status === "error" && (
          <div className="lobby-error-wrap">
            <div className="lobby-error">{err}</div>
            {lastLiveKitUrl && (
              <p className="lobby-error-url">
                URL usada: <code>{lastLiveKitUrl}</code>
                <br />
                <span className="lobby-error-hint">
                  Túnel 7880 deve estar aberto e a API reiniciada com essa URL. Se falhar sempre, use LiveKit Cloud — veja docs/audio-livekit-cloud.md.
                </span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
