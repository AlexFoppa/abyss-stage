import { useAuth } from "../auth/AuthProvider";

export function HomeGMScreen({
  onCharacters,
}: {
  onCharacters: () => void;
}) {

  const auth = useAuth();

  return (
    <div className="lobby-wrap">
      <div className="lobby-cabinet">
        <div className="lobby-actions ui-stack" style={{ gap: 10 }}>
          <button className="ui-btn" type="button" onClick={() => auth.setViewMode("PLAYER")}>
            Alternar para<br />visão de Jogador
          </button>
          <button className="ui-btn" type="button" onClick={onCharacters}>
            Personagens
          </button>
        </div>
      </div>
    </div>
  );

}
