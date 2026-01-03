import { useEffect } from "react";
import { joinRoom } from "./rtc/livekit";

function App() {
  useEffect(() => {
    fetch("http://127.0.0.1:8000/token?room=test&user=alex")
      .then(r => r.json())
      .then(({ token }) =>
        joinRoom(token, "ws://127.0.0.1:7880")
      );
  }, []);

  return <h1>Audio connecting…</h1>;
}

export default App;
