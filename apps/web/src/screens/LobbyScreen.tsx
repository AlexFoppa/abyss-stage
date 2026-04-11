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
      : "WebSocket chegou, mas a mídia não. Use LiveKit Cloud (ver Readme na raiz do repo). Erro: ";
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
  /** Slot de expressão em exibição (0-9). Padrão 1 = Padrão. */
  expression_slot?: number | null;
  /** Mapa slot (0-9) → URL; para exibir override/current em qualquer slot. */
  character_image_by_slot?: Record<number, string> | null;
  /** E-mail do usuário; usado como fallback de exibição. */
  user_email?: string | null;
  /** Nome de exibição do jogador (name or email); usado na lista do lobby. */
  user_name?: string | null;
};

export function LobbyScreen({
  room,
  isGM = false,
  selectedCharacter: _selectedCharacter,
  lobbyParticipants = [],
  onCreateCharacter,
  onSelectCharacter,
  onRoomConnected,
  showMainUI = true,
  showActiveMustSelectCharacter = false,
  onEditProfile,
  floatingMenuPos = undefined,
  setFloatingMenuPos = undefined,
  floatingMenuAudioOffsetBottom = undefined,
}: {
  room?: Room | null;
  /** Mestre: conectar à sala mesmo quando não está na view LOBBY (ex.: reconexão em GM_ESPETACULO). */
  isGM?: boolean;
  selectedCharacter: null | { id: number; name: string; system: string };
  lobbyParticipants?: LobbyParticipant[];
  onCreateCharacter: () => void;
  onSelectCharacter: () => void;
  onRoomConnected?: (room: Room) => void;
  /** Quando false, só renderiza o widget de áudio (portal). Use true apenas na view LOBBY. */
  showMainUI?: boolean;
  /** Espetáculo ativo e jogador ainda sem personagem: mostrar mensagem para selecionar personagem (após conectar áudio). */
  showActiveMustSelectCharacter?: boolean;
  /** Abre a tela de edição de informações do jogador (nome). */
  onEditProfile?: () => void;
  /** Posição compartilhada do menu flutuante (áudio + barra personagem). Quando em espetáculo, áudio fica acima. */
  floatingMenuPos?: { right: number; bottom: number };
  setFloatingMenuPos?: (pos: { right: number; bottom: number }) => void;
  /** Offset em px para o áudio (ex.: altura da barra personagem quando unificado). */
  floatingMenuAudioOffsetBottom?: number;
}) {
  const { logout } = useAuth();
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [lastLiveKitUrl, setLastLiveKitUrl] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(true);
  const [audioMenuOpen, setAudioMenuOpen] = useState(false);
  const [micPermission, setMicPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  /** Portão: pedir permissão de microfone antes de conectar. 'pending' = mostrar tela; 'granted'/'skipped' = pode conectar. */
  const [micGate, setMicGate] = useState<"pending" | "granted" | "denied" | "skipped">("pending");
  const [micGateRequesting, setMicGateRequesting] = useState(false);
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
  const [internalAudioPos, setInternalAudioPos] = useState(() => ({ ...persistedAudioPanelPos }));
  const audioPos = floatingMenuPos ?? internalAudioPos;
  const setAudioPos = setFloatingMenuPos ?? setInternalAudioPos;
  const audioOffsetBottom = floatingMenuAudioOffsetBottom ?? 0;
  const audioPanelPos = { right: audioPos.right, bottom: audioPos.bottom + audioOffsetBottom };
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

  const onAudioDragStart = useCallback(
    (e: React.MouseEvent, fromTrigger: boolean) => {
      e.preventDefault();
      e.stopPropagation();
      audioDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startRight: audioPos.right,
        startBottom: audioPos.bottom,
        fromTrigger,
        didMove: false,
      };
    },
    [audioPos.right, audioPos.bottom]
  );

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
        if (!setFloatingMenuPos) {
          persistedAudioPanelPos.right = right;
          persistedAudioPanelPos.bottom = bottom;
        }
        setAudioPos({ right, bottom });
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
  }, [setAudioPos, setFloatingMenuPos]);

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
  /** GM que não está no lobby (ex.: reconexão em GM_ESPETACULO): pular portão para poder conectar à sala. */
  useEffect(() => {
    if (isGM && !showMainUI && !room && micGate === "pending") setMicGate("skipped");
  }, [isGM, showMainUI, room, micGate]);
  /** Conecta automaticamente quando: (lobby visível ou GM sem sala) e portão já passado. */
  useEffect(() => {
    const shouldConnect = (showMainUI || (isGM && !room)) && micGate !== "pending" && micGate !== "denied";
    if (!shouldConnect || didAutoConnect.current) return;
    didAutoConnect.current = true;
    connectAudio();
  }, [showMainUI, isGM, room, micGate, connectAudio]);

  /** Se o navegador já tiver permissão concedida, passar o portão e permitir auto-connect. */
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    navigator.permissions.query({ name: "microphone" as PermissionDescriptor["name"] }).then(
      (result) => {
        setMicPermission(result.state === "granted" ? "granted" : result.state === "denied" ? "denied" : "unknown");
        if (result.state === "granted" && micGate === "pending") setMicGate("granted");
        result.onchange = () => setMicPermission(result.state === "granted" ? "granted" : result.state === "denied" ? "denied" : "unknown");
      },
      () => {}
    );
  }, [micGate]);

  /** Pedir permissão de microfone (gesto do usuário). Se concedida, o useEffect conecta. */
  const requestMicAndConnect = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMicGate("skipped");
      return;
    }
    setMicGateRequesting(true);
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicPermission("granted");
      setMicGate("granted");
    } catch (e: unknown) {
      const name = e instanceof Error ? e.name : "";
      if (name === "NotAllowedError" || (e && typeof (e as { name?: string }).name === "string" && (e as { name: string }).name === "NotAllowedError")) {
        setMicPermission("denied");
        setMicGate("denied");
      } else {
        setErr(e instanceof Error ? e.message : "Erro ao acessar o microfone.");
      }
    } finally {
      setMicGateRequesting(false);
    }
  }, []);

  const skipMicAndConnect = useCallback(() => {
    setMicGate("skipped");
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

  const displayName = (p: LobbyParticipant) => (p.user_name ?? p.user_email ?? "").trim() || null;
  const toTitleCase = (s: string) =>
    s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const posterLabels = lobbyParticipants
    .filter((p) => !p.is_gm)
    .map((p) => {
      const raw =
        p.character_name != null && p.character_name.trim() !== ""
          ? p.character_name
          : (displayName(p) ? `${displayName(p)} (se arrumando)` : "(se arrumando)");
      return toTitleCase(raw);
    });

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
                      URL: <code>{lastLiveKitUrl}</code>. Túnel 7880 e API; ou use LiveKit Cloud (ver Readme na raiz do repo).
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

  /* Portão de microfone: bloquear lobby até o usuário permitir (ou escolher continuar sem áudio).
   * Em portal para document.body para não ficar sob .center--espetaculo-off (pointer-events: none). */
  const micGateContent = (
    <div className="lobby-mic-gate" role="dialog" aria-modal="true" aria-labelledby="lobby-mic-gate-title">
      <div className="lobby-mic-gate__box">
        <h2 id="lobby-mic-gate-title" className="lobby-mic-gate__title">
          {micGate === "denied" ? "Microfone bloqueado" : "Permissão de microfone"}
        </h2>
        <p className="lobby-mic-gate__text">
          {micGate === "denied"
            ? "O microfone foi bloqueado. Sem permissão, você não poderá falar no lobby nem no espetáculo. Permita nas configurações do site (ícone de cadeado na barra de endereço) e atualize a página, ou continue sem áudio."
            : "Para participar com voz no lobby e no espetáculo, é necessário permitir o uso do microfone. O navegador pedirá a permissão ao clicar em \"Permitir microfone\"."}
        </p>
        <div className="lobby-mic-gate__actions">
          {micGate === "denied" ? (
            <>
              <button
                type="button"
                className="ui-btn"
                onClick={() => setMicGate("pending")}
              >
                Tentar novamente
              </button>
              <button
                type="button"
                className="ui-btn ui-btn--ghost"
                onClick={skipMicAndConnect}
              >
                Continuar sem áudio
              </button>
            </>
          ) : (
            <button
              type="button"
              className="ui-btn"
              onClick={requestMicAndConnect}
              disabled={micGateRequesting}
            >
              {micGateRequesting ? "Aguardando permissão…" : "Permitir microfone"}
            </button>
          )}
        </div>
        {err && <p className="lobby-mic-gate__error">{err}</p>}
      </div>
    </div>
  );

  if (!room && (micGate === "pending" || micGate === "denied")) {
    const portalTarget = typeof document !== "undefined" ? document.body : null;
    return (
      <>
        {audioWidget}
        {portalTarget ? createPortal(micGateContent, portalTarget) : micGateContent}
      </>
    );
  }

  return (
    <div className="lobby-wrap">
      {showActiveMustSelectCharacter && connected ? (
        <div className="lobby-espetaculo-enter-card" role="alert">
          <p className="lobby-espetaculo-enter-card__text">
            Há um espetáculo em andamento. Selecione um personagem para entrar no jogo.
          </p>
          <button type="button" className="ui-btn" onClick={onSelectCharacter}>
            Selecionar personagem
          </button>
        </div>
      ) : null}
      {posterLabels.length > 0 ? (
        <div className="lobby-wall-poster" aria-label="Poster dos jogadores no lobby">
          <div className="lobby-wall-poster__frame">
            <div className="lobby-wall-poster__kicker">Estrelando</div>
            <div className="lobby-wall-poster__name">{posterLabels.join(", ")}</div>
            <div className="lobby-wall-poster__foot">Abyss Stage</div>
          </div>
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
              <button
                className="ui-btn"
                type="button"
                onClick={onEditProfile}
                title="Editar nome e informações do jogador"
              >
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
