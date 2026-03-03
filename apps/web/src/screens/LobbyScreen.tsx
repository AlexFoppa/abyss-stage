// apps/web/src/screens/LobbyScreen.tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Room, Track, createAudioAnalyser, type LocalAudioTrack } from "livekit-client";
import { api } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { joinRoom } from "../rtc/livekit";

const MIC_TOOLTIP_DENIED =
  "Microfone bloqueado. Clique no ícone de cadeado (ou «i») na barra de endereço e permita o uso do microfone para este site.";

/** Posição do widget de áudio persistida fora do componente para não saltar ao abrir/fechar ou em remount. */
const persistedAudioPanelPos = { right: 24, bottom: 180 };

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

export type AudioCaptureOpts = {
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  voiceIsolation: boolean;
};

export type LobbyParticipant = {
  user_id: number;
  identity: string;
  is_gm: boolean;
  character_id: number | null;
  character_name: string | null;
  character_image_url: string | null;
  /** E-mail do usuário (nome no lobby); preenchido pelo backend ou pelo fallback. */
  user_email?: string | null;
};

export function LobbyScreen({
  room,
  selectedCharacter: _selectedCharacter,
  lobbyParticipants = [],
  onCreateCharacter,
  onSelectCharacter,
  onRoomConnected,
  showMainUI = true,
}: {
  room?: Room | null;
  selectedCharacter: null | { id: number; name: string; system: string };
  lobbyParticipants?: LobbyParticipant[];
  onCreateCharacter: () => void;
  onSelectCharacter: () => void;
  onRoomConnected?: (room: Room) => void;
  /** Quando false, só renderiza o widget de áudio (portal). Use true apenas na view LOBBY. */
  showMainUI?: boolean;
}) {
  const { logout } = useAuth();
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [lastLiveKitUrl, setLastLiveKitUrl] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(true);
  const [audioMenuOpen, setAudioMenuOpen] = useState(false);
  const [micPermission, setMicPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const [diagnosticRunning, setDiagnosticRunning] = useState(false);
  const [diagnosticSteps, setDiagnosticSteps] = useState<DiagnosticStep[] | null>(null);

  const [muted, setMuted] = useState(true);
  const [captureOpts, setCaptureOpts] = useState<AudioCaptureOpts>({
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: true,
    voiceIsolation: false,
  });
  const [remoteVolume, setRemoteVolume] = useState(1);
  const [deviceId, setDeviceId] = useState<string>("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [krispEnabled, setKrispEnabled] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [audioPanelPos, setAudioPanelPos] = useState(() => ({ ...persistedAudioPanelPos }));
  const audioDragRef = useRef<{
    startX: number;
    startY: number;
    startRight: number;
    startBottom: number;
    fromTrigger: boolean;
    didMove: boolean;
  } | null>(null);
  const analyserRef = useRef<ReturnType<typeof createAudioAnalyser> | null>(null);
  const animationRef = useRef<number>(0);

  const DRAG_THRESHOLD = 8;

  const onAudioDragStart = useCallback((e: React.MouseEvent, fromTrigger: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    audioDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startRight: persistedAudioPanelPos.right,
      startBottom: persistedAudioPanelPos.bottom,
      fromTrigger,
      didMove: false,
    };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = audioDragRef.current;
      if (!r) return;
      const dx = e.clientX - r.startX;
      const dy = r.startY - e.clientY;
      if (!r.didMove && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        r.didMove = true;
      }
      if (r.didMove) {
        const right = Math.max(0, r.startRight - dx);
        const bottom = Math.max(0, r.startBottom + dy);
        persistedAudioPanelPos.right = right;
        persistedAudioPanelPos.bottom = bottom;
        setAudioPanelPos({ right, bottom });
      }
    };
    const onUp = () => {
      const r = audioDragRef.current;
      if (r?.fromTrigger && !r.didMove) {
        setAudioMenuOpen((o) => !o);
      }
      audioDragRef.current = null;
    };
    const opts = { capture: true };
    window.addEventListener("mousemove", onMove, opts);
    window.addEventListener("mouseup", onUp, opts);
    return () => {
      window.removeEventListener("mousemove", onMove, opts);
      window.removeEventListener("mouseup", onUp, opts);
    };
  }, []);

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
      await room.localParticipant.setMicrophoneEnabled(false);
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
    connectAudio();
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

  const audioTooltip =
    micPermission === "denied" ? MIC_TOOLTIP_DENIED : status === "error" && err ? err : undefined;

  const connected = !!room;
  const pub = room?.localParticipant.getTrackPublication(Track.Source.Microphone);
  const localAudioTrack = pub?.track as LocalAudioTrack | undefined;

  const applyCaptureOpts = useCallback(
    async (opts: AudioCaptureOpts) => {
      if (!localAudioTrack) return;
      try {
        await localAudioTrack.restartTrack({
          noiseSuppression: opts.noiseSuppression,
          echoCancellation: opts.echoCancellation,
          autoGainControl: opts.autoGainControl,
          voiceIsolation: opts.voiceIsolation ? true : undefined,
          deviceId: deviceId || undefined,
        });
      } catch (_) {}
    },
    [localAudioTrack, deviceId]
  );

  const toggleMute = useCallback(async () => {
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }, [room, muted]);

  const toggleCaptureOpt = useCallback(
    (key: keyof AudioCaptureOpts) => {
      const next = { ...captureOpts, [key]: !captureOpts[key] };
      setCaptureOpts(next);
      applyCaptureOpts(next);
    },
    [captureOpts, applyCaptureOpts]
  );

  const setVolume = useCallback(
    (v: number) => {
      setRemoteVolume(v);
      room?.remoteParticipants.forEach((p) => p.setVolume(v, Track.Source.Microphone));
    },
    [room]
  );

  const selectDevice = useCallback(
    async (id: string) => {
      setDeviceId(id);
      if (!localAudioTrack) return;
      try {
        await localAudioTrack.restartTrack({
          ...captureOpts,
          deviceId: id || undefined,
        });
      } catch (_) {}
    },
    [localAudioTrack, captureOpts]
  );

  useEffect(() => {
    if (!connected || !room) return;
    const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    setMuted(micPub?.track?.isMuted ?? false);
  }, [connected, room]);

  useEffect(() => {
    if (!room) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "m" && !e.ctrlKey && !e.metaKey && !e.altKey && (e.target as HTMLElement)?.tagName !== "INPUT" && (e.target as HTMLElement)?.tagName !== "TEXTAREA") {
        e.preventDefault();
        toggleMute();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [room, toggleMute]);

  const toggleKrisp = useCallback(async () => {
    if (!localAudioTrack || !connected) return;
    if (krispEnabled) {
      try {
        await localAudioTrack.restartTrack({
          ...captureOpts,
          deviceId: deviceId || undefined,
        });
        setKrispEnabled(false);
      } catch (_) {}
    } else {
      try {
        const { KrispNoiseFilter } = await import("@livekit/krisp-noise-filter");
        await localAudioTrack.setProcessor(KrispNoiseFilter());
        setKrispEnabled(true);
      } catch (_) {}
    }
  }, [localAudioTrack, connected, krispEnabled, captureOpts, deviceId]);

  useEffect(() => {
    if (!localAudioTrack || !connected) return;
    let cancelled = false;
    try {
      const result = createAudioAnalyser(localAudioTrack, { fftSize: 128, smoothingTimeConstant: 0.6 });
      analyserRef.current = result;
      const tick = () => {
        if (cancelled || !analyserRef.current) return;
        const vol = analyserRef.current.calculateVolume();
        setMicLevel(vol);
        animationRef.current = requestAnimationFrame(tick);
      };
      animationRef.current = requestAnimationFrame(tick);
      return () => {
        cancelled = true;
        cancelAnimationFrame(animationRef.current);
        result.cleanup();
        analyserRef.current = null;
      };
    } catch (_) {
      return undefined;
    }
  }, [localAudioTrack, connected]);

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then((devs) => {
      setDevices(devs.filter((d) => d.kind === "audioinput"));
    });
  }, [connected]);

  const posterLabels = lobbyParticipants
    .filter((p) => !p.is_gm)
    .map((p) =>
      p.character_name != null && p.character_name.trim() !== ""
        ? p.character_name
        : (p.user_email ? `${p.user_email} (se arrumando)` : "(se arrumando)")
    );

  const audioWidget = createPortal(
    <div
      className="lobby-audio-wrap"
      style={{ right: audioPanelPos.right, bottom: audioPanelPos.bottom }}
      role="region"
      aria-label="Menu de áudio"
    >
      <button
        type="button"
        className={"lobby-audio-mute-btn" + (muted ? " is-active" : "")}
        onClick={toggleMute}
        title={audioTooltip ?? (muted ? "Desmutar (M)" : "Mutar (M)")}
        aria-pressed={muted}
        aria-label={muted ? "Desmutar microfone" : "Mutar microfone"}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {muted ? (
            <>
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
              <path d="M12 19v4M8 23h8" />
            </>
          ) : (
            <>
              <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
            </>
          )}
        </svg>
      </button>
      <button
        type="button"
        className="lobby-audio-trigger"
        onMouseDown={(e) => onAudioDragStart(e, true)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        aria-expanded={audioMenuOpen}
        aria-label={audioMenuOpen ? "Recolher opções de áudio" : "Opções de áudio"}
        title={audioMenuOpen ? "Recolher (clique) ou arraste para mover" : "Áudio — clique para abrir ou arraste para mover"}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
          <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
          <path d="M18 15v5m-2.5-2.5h5" strokeWidth="1.5" />
        </svg>
      </button>
      <div className={"lobby-audio-panel" + (audioMenuOpen ? " lobby-audio-panel--open" : "")}>
        <div
          className="lobby-audio-drag-handle"
          title="Arraste para mover"
          onMouseDown={(e) => onAudioDragStart(e, false)}
        >
          <span className="lobby-audio-drag-dots">⋯</span>
          <span className="lobby-audio-panel-title">Áudio</span>
        </div>
        <div className="lobby-audio-body">
          {!connected ? (
            <div className="lobby-audio-status-block">
              <p className="lobby-audio-status" role="status" aria-live="polite">
                {status === "connecting" && "Conectando…"}
                {status === "connected" && "Áudio ativo"}
                {status === "error" && err && (
                  <>
                    Falha na conexão.{" "}
                    <button type="button" className="lobby-audio-retry" onClick={connectAudio}>
                      Tentar novamente
                    </button>
                  </>
                )}
                {status === "idle" && "Iniciando áudio…"}
              </p>
              {micPermission === "denied" && (
                <p className="lobby-permission-hint" role="status">
                  {MIC_TOOLTIP_DENIED}
                </p>
              )}
              <button
                type="button"
                className="lobby-audio-diagnostic-btn"
                disabled={diagnosticRunning}
                onClick={runDiagnostic}
                title="Identifica se o problema é URL/túnel ou rede (WebRTC/NAT)"
              >
                {diagnosticRunning ? "Diagnosticando…" : "Diagnosticar conexão"}
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
              {err && status === "error" && (
                <div className="lobby-audio-error-detail">
                  <span className="lobby-error">{err}</span>
                  {lastLiveKitUrl && (
                    <p className="lobby-error-url">
                      URL: <code>{lastLiveKitUrl}</code>. Túnel 7880 e API; ou use LiveKit Cloud (docs/audio-livekit-cloud.md).
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="lobby-audio-toggles">
                <button
                  type="button"
                  className={"lobby-audio-icon-btn" + (captureOpts.noiseSuppression ? " is-active" : "")}
                  title="Supressão de ruído"
                  onClick={() => setCaptureOpts((o) => ({ ...o, noiseSuppression: !o.noiseSuppression }))}
                >
                  <span aria-hidden>NS</span>
                </button>
                <button
                  type="button"
                  className={"lobby-audio-icon-btn" + (captureOpts.echoCancellation ? " is-active" : "")}
                  title="Cancelamento de eco"
                  onClick={() => setCaptureOpts((o) => ({ ...o, echoCancellation: !o.echoCancellation }))}
                >
                  <span aria-hidden>EC</span>
                </button>
                <button
                  type="button"
                  className={"lobby-audio-icon-btn" + (captureOpts.autoGainControl ? " is-active" : "")}
                  title="Controle automático de ganho"
                  onClick={() => setCaptureOpts((o) => ({ ...o, autoGainControl: !o.autoGainControl }))}
                >
                  <span aria-hidden>AGC</span>
                </button>
                <button
                  type="button"
                  className={"lobby-audio-icon-btn" + (captureOpts.voiceIsolation ? " is-active" : "")}
                  title="Isolamento de voz"
                  onClick={() => setCaptureOpts((o) => ({ ...o, voiceIsolation: !o.voiceIsolation }))}
                >
                  <span aria-hidden>VI</span>
                </button>
                <button
                  type="button"
                  className={"lobby-audio-icon-btn" + (krispEnabled ? " is-active" : "")}
                  title="Krisp (redução de ruído)"
                  onClick={toggleKrisp}
                >
                  <span aria-hidden>K</span>
                </button>
              </div>
              <div className="lobby-audio-sliders">
                <label className="lobby-audio-label">
                  Volume dos outros
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={remoteVolume}
                    onChange={(e) => setRemoteVolume(Number(e.target.value))}
                  />
                </label>
                <label className="lobby-audio-label">
                  Dispositivo
                  <select
                    className="lobby-audio-select"
                    value={deviceId}
                    onChange={(e) => setDeviceId(e.target.value)}
                  >
                    <option value="">Padrão</option>
                    {devices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Dispositivo ${d.deviceId.slice(0, 8)}`}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="lobby-audio-level">
                  <span>Nível do microfone</span>
                  <div className="lobby-audio-level-bar" role="meter" aria-valuenow={Math.round(micLevel * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <div className="lobby-audio-level-fill" style={{ width: `${Math.min(100, micLevel * 100)}%` }} />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );

  if (!showMainUI) {
    return audioWidget;
  }

  return (
    <div className="lobby-wrap">
      {posterLabels.length > 0 ? (
        <div className="lobby-wall-poster" aria-label="Poster dos jogadores no lobby">
          <div className="lobby-wall-poster__kicker">Estrelando:</div>
          <div className="lobby-wall-poster__name">{posterLabels.join(", ")}</div>
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

            <div className="lobby-actions-secondary">
              <button className="ui-btn" disabled title="Em breve">
                Informações do jogador
              </button>
            </div>

            <button className="ui-btn ui-btn--ghost" onClick={logout} title="Encerrar sessão">
              Se retirar
            </button>
          </div>
        </div>

      </div>

      {audioWidget}
    </div>
  );
}
