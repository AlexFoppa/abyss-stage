export function HomeGMScreen({
  onRoteiro,
  onFigurinos,
  onCenarios,
  onLobby,
  onEspetaculo,
  onLogout,
}: {
  onRoteiro: () => void;
  onFigurinos: () => void;
  onCenarios: () => void;
  onLobby?: () => void;
  onEspetaculo?: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="lobby-wrap">
      <div className="lobby-cabinet">
        <div className="gm-home-actions ui-stack" style={{ gap: 10 }}>
          {onLobby && (
            <button className="ui-btn gm-home-actions__btn" type="button" onClick={onLobby}>
              <span className="gm-home-actions__icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4v16h7v-6h2v6h7V4"/><path d="M12 10V4"/><path d="M9 7h6"/></svg>
              </span>
              Lobby
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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </span>
            Elenco
          </button>
          <button className="ui-btn gm-home-actions__btn" type="button" onClick={onCenarios}>
            <span className="gm-home-actions__icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            </span>
            Cenários
          </button>
          {onEspetaculo && (
            <button className="ui-btn gm-home-actions__btn" type="button" onClick={onEspetaculo}>
              <span className="gm-home-actions__icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17.2 5.5c.8 0 1.5 1 1.5 2.2v7c0 1.2-.7 2.2-1.5 2.2-1 0-1.8-.6-2.1-1.4"/><path d="M17.2 5.5c-.8 0-1.5 1-1.5 2.2v7c0 1.2.7 2.2 1.5 2.2 1 0 1.8-.6 2.1-1.4"/><path d="M16.2 9.8c.4 0 .7.3.7.7s-.3.7-.7.7-.7-.3-.7-.7.3-.7.7-.7z"/><path d="M15.2 12.4 Q16.4 13.6 17.6 12.4"/><path d="M6.8 5.5c-.8 0-1.5 1-1.5 2.2v7c0 1.2.7 2.2 1.5 2.2 1 0 1.8-.6 2.1-1.4"/><path d="M6.8 5.5c.8 0 1.5 1 1.5 2.2v7c0 1.2-.7 2.2-1.5 2.2-1 0-1.8-.6-2.1-1.4"/><path d="M7.8 10c-.4 0-.7.3-.7.7s.3.7.7.7.7-.3.7-.7-.3-.7-.7-.7z"/><path d="M6.8 12.6 Q8 11.4 9.2 12.6"/><path d="M12 2.5v1.2"/><path d="M12 2.5c-1 0-1.8.6-1.8 1.4s.5 1.4 1.3 1.4 1.3-.6 1.3-1.4-.5-1.4-1.3-1.4z"/>
                </svg>
              </span>
              Espetáculo
            </button>
          )}
          <button className="ui-btn ui-btn--ghost" type="button" onClick={onLogout}>
            Se retirar
          </button>
        </div>
      </div>
    </div>
  );
}
