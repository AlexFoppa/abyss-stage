import { Room } from "livekit-client";

export async function joinRoom(token: string, url: string) {
  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
  });

  try {
    await room.connect(url, token, {
      rtcConfig: { iceTransportPolicy: "relay" },
    });
    await room.localParticipant.setMicrophoneEnabled(true);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg.includes("pc connection") || msg.includes("establish") ? "Não foi possível estabelecer a conexão de áudio. Verifique o túnel e a URL do LiveKit (wss://...) no servidor." : msg);
  }
  return room;
}
