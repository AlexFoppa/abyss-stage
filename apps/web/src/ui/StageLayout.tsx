import "../styles/stage.css";
import { useAuth } from "../auth/AuthProvider";

export function StageLayout({
  logged,
  isGM,
  showBackstage,
  stageMode = "IDLE",
  curtainsOpen = false,
  children,
}: {
  logged: boolean;
  isGM: boolean;
  showBackstage: boolean;
  stageMode?: "IDLE" | "ZOOM_IN";
  curtainsOpen?: boolean;
  children: React.ReactNode;
}) {
  const auth = useAuth();
  
  const showBackToGM =
    logged && auth.user?.role === "GM" && auth.viewMode === "PLAYER";

  return (
    <div
      className={`stage ${curtainsOpen ? "logged" : ""} ${
        stageMode === "ZOOM_IN" ? "stage--zoom-in" : ""
      }`}
    >
      <img src="/valance.png" className="valance" alt="" />

      <img src="/curtain_left.png" className="curtain left" alt="" />
      <img src="/curtain_right.png" className="curtain right" alt="" />

      {showBackstage && <img src="/backstage.png" className="backstage" alt="" />}

      <div className={`center ${logged ? "center--app" : "center--modal"}`}>
        {showBackToGM && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              paddingRight: 28,
              marginTop: 24,
              marginBottom: 10,
            }}
          >
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              onClick={() => auth.setViewMode("GM")}
              style={{ width: "auto" }}
            >
              Voltar para Mestre
            </button>
          </div>
        )}

        {children}
      </div>
    </div>
  );
}