import "./StageLayout.css";

export function StageLayout({
  logged,
  isGM,
  showBackstage,
  children,
}: {
  logged: boolean;
  isGM: boolean;
  showBackstage: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`stage ${logged && isGM ? "logged" : ""}`}>
      <img src="/valance.png" className="valance" alt="" />

      <img src="/curtain_left.png" className="curtain left" alt="" />
      <img src="/curtain_right.png" className="curtain right" alt="" />

      {showBackstage && <img src="/backstage.png" className="backstage" alt="" />}

      <div className={`center ${showBackstage ? "center--app" : "center--modal"}`}>{children}</div>
    </div>
  );
}
