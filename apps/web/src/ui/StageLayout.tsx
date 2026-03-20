import "../styles/stage.css";
import { useAuth } from "../auth/AuthProvider";

export function StageLayout({
  logged,
  isGM: _isGM,
  showBackstage,
  stageMode = "IDLE",
  curtainsOpen = false,
  hideValance = false,
  espetaculoPhase = null,
  /** Quando false, o .center não recebe center--espetaculo-off (jogador em seleção de personagem pode clicar). */
  centerOffForStage,
  stageContent = null,
  children,
}: {
  logged: boolean;
  isGM: boolean;
  showBackstage: boolean;
  stageMode?: "IDLE" | "ZOOM_IN";
  curtainsOpen?: boolean;
  /** Quando true, a valance não é exibida (telas do GM). Visível apenas para o jogador. */
  hideValance?: boolean;
  /** Fase do espetáculo: sliding = conteúdo desce; half = cortina meio aberta (jogador); stage = cortina aberta, valance sai. */
  espetaculoPhase?: "sliding" | "half" | "stage" | null;
  /** Quando true, aplica center--espetaculo-off. Deve ser true só quando o palco está de fato visível (GM ou jogador com personagem). */
  centerOffForStage?: boolean;
  /** Conteúdo do palco (cenário/personagens), renderizado atrás da cortina. */
  stageContent?: React.ReactNode;
  children: React.ReactNode;
}) {
  const auth = useAuth();
  
  const showBackToGM =
    logged && auth.user?.role === "GM" && auth.viewMode === "PLAYER";

  const espetaculoSliding = espetaculoPhase === "sliding";
  const espetaculoActive = espetaculoPhase === "half" || espetaculoPhase === "stage";
  const centerOff = centerOffForStage === true;

  return (
    <div
      className={`stage ${curtainsOpen ? "logged" : ""} ${
        stageMode === "ZOOM_IN" ? "stage--zoom-in" : ""
      } ${hideValance ? "stage--no-valance" : ""} ${
        espetaculoSliding ? "stage--espetaculo-sliding" : ""
      } ${espetaculoActive ? "stage--espetaculo-active" : ""} ${
        espetaculoPhase === "stage" ? "stage--valance-out stage--curtains-out stage--show-active" : ""
      }`}
    >
      {stageContent && <div className="stage__content">{stageContent}</div>}

      {!hideValance && <img src="/valance.png" className="valance" alt="" />}

      <img src="/curtain_left.png" className="curtain left" alt="" />
      <img src="/curtain_right.png" className="curtain right" alt="" />

      {showBackstage && !espetaculoActive && <img src="/backstage.png" className="backstage" alt="" />}

      <div className={`center ${logged ? "center--app" : "center--modal"} ${centerOff ? "center--espetaculo-off" : ""}`}>
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