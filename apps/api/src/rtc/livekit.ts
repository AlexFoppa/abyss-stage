import { Room } from "livekit-client";

export async function joinRoom(token: string, url: string) {
  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
  });

  await room.connect(url, token);
  await room.localParticipant.setMicrophoneEnabled(true);

  return room;
}
