import { Room } from "livekit-client";

export async function joinRoom(token: string, url: string) {
  const room = new Room();
  await room.connect(url, token);
  await room.localParticipant.setMicrophoneEnabled(true);
  console.log("connected");
}
