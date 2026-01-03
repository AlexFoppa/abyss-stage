import "./StageLayout.css";

export function StageLayout({
  logged,
  children,
}: {
  logged: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`stage ${logged ? "logged" : ""}`}>
      <img src="/valance.png" className="valance" />
      <img src="/curtain_left.png" className="curtain left" />
      <img src="/curtain_right.png" className="curtain right" />
      <div className="center">{children}</div>
    </div>
  );
}
