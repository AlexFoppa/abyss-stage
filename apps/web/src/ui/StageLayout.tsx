import "../styles/stage.css";

export function StageLayout({
  logged,
  isGM,
  showBackstage,
  stageMode = "IDLE",
  children,
}: {
  logged: boolean;
  isGM: boolean;
  showBackstage: boolean;
  stageMode?: "IDLE" | "ZOOM_IN";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`stage ${logged && isGM ? "logged" : ""} ${
        stageMode === "ZOOM_IN" ? "stage--zoom-in" : ""
      }`}
    >
      <img src="/valance.png" className="valance" alt="" />

      <img src="/curtain_left.png" className="curtain left" alt="" />
      <img src="/curtain_right.png" className="curtain right" alt="" />

      {showBackstage && <img src="/backstage.png" className="backstage" alt="" />}

      <div
        className={`center ${
          showBackstage ? "center--app" : "center--modal"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
