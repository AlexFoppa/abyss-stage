export function HomeGMScreen({
  onRoteiro,
  onFigurinos,
  onLogout,
}: {
  onRoteiro: () => void;
  onFigurinos: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="lobby-wrap">
      <div className="lobby-cabinet">
        <div className="gm-home-actions ui-stack" style={{ gap: 10 }}>
          <button className="ui-btn" type="button" onClick={onRoteiro}>
            Roteiro
          </button>
          <button className="ui-btn" type="button" onClick={onFigurinos}>
            Figurinos
          </button>
          <button className="ui-btn ui-btn--ghost" type="button" disabled title="Em breve">
            Espetáculo
          </button>
          <button className="ui-btn ui-btn--ghost" type="button" onClick={onLogout}>
            Se retirar
          </button>
        </div>
      </div>
    </div>
  );
}
