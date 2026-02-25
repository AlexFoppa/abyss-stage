export function HomeGMScreen({
  onRoteiro,
  onFigurinos,
  onCenarios,
  onLobby,
  onLogout,
}: {
  onRoteiro: () => void;
  onFigurinos: () => void;
  onCenarios: () => void;
  onLobby?: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="lobby-wrap">
      <div className="lobby-cabinet">
        <div className="gm-home-actions ui-stack" style={{ gap: 10 }}>
          {onLobby && (
            <button className="ui-btn gm-home-actions__btn" type="button" onClick={onLobby}>
              <span className="gm-home-actions__icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </span>
              Lobby (áudio)
            </button>
          )}
          <button className="ui-btn gm-home-actions__btn" type="button" onClick={onRoteiro}>
            <span className="gm-home-actions__icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
            </span>
            Roteiro
          </button>
          <button className="ui-btn gm-home-actions__btn" type="button" onClick={onFigurinos}>
            <span className="gm-home-actions__icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h1.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>
            </span>
            Figurinos
          </button>
          <button className="ui-btn gm-home-actions__btn" type="button" onClick={onCenarios}>
            <span className="gm-home-actions__icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            </span>
            Cenários
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
