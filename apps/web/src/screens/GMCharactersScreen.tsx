import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

type GMCharacter = {
  id: number;
  name: string;
  concept: string;
  system: string;
  backstory: string;
  notes: string;
  systems?: string[];
  owner_email: string;
};

export function GMCharactersScreen({
  onBack,
  onEdit,
  onCreate,
}: {
  onBack: () => void;
  onEdit?: (c: GMCharacter) => void;
  onCreate?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [chars, setChars] = useState<GMCharacter[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);

  const active = useMemo(
    () => chars.find((c) => c.id === activeId) || null,
    [chars, activeId]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr(null);
      setLoading(true);
      try {
        const list = await api<GMCharacter[]>("/api/gm/characters");
        if (cancelled) return;
        setChars(Array.isArray(list) ? list : []);
        setActiveId((Array.isArray(list) && list[0]?.id) || null);
      } catch (e: any) {
        if (cancelled) return;
        const msg =
          typeof e?.message === "string"
            ? e.message
            : typeof e === "string"
              ? e
              : typeof e?.body?.detail === "string"
                ? e.body.detail
                : "Falha ao carregar personagens";
        setErr(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function systemLabel(sys: string) {
    if (sys === "candela_obscura") return "Candela Obscura";
    if (sys === "simplificado") return "Simplificado";
    return sys || "—";
  }

  function systemsLabel(systems?: string[]) {
    const list = (systems || []).filter(Boolean);
    if (!list.length) return "—";
    return list.map(systemLabel).join(", ");
  }

  return (
    <div className="select-scene">
      <div className="select-grid">
        <section className="ui-card select-col select-col--list">
          <div className="select-head">
            <h2 className="select-title">Personagens</h2>
          </div>

          {loading ? (
            <div className="select-muted">Carregando…</div>
          ) : chars.length === 0 ? (
            <div className="select-muted">Nenhum personagem encontrado.</div>
          ) : (
            <div className="select-list">
              {chars.map((c) => {
                const isActive = c.id === activeId;
                return (
                  <button
                    key={c.id}
                    className={`select-item ${isActive ? "is-active" : ""}`}
                    onClick={() => setActiveId(c.id)}
                    type="button"
                  >
                    <div className="select-item-name">
                      {c.name} ({c.owner_email})
                    </div>
                    <div className="select-item-sub">
                      {systemsLabel(c.systems || [c.system])}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="select-footer">
            <button className="ui-btn ui-btn--ghost" onClick={onBack} type="button">
              Voltar
            </button>

            <button
              className="ui-btn"
              onClick={() => onCreate?.()}
              type="button"
              disabled={!onCreate}
              title={!onCreate ? "Criação não disponível" : ""}
            >
              Criar
            </button>
          </div>

          {err && <div className="select-error">{err}</div>}
        </section>

        <section className="ui-card select-col select-col--book">
          <h2 className="select-title">Ficha</h2>

          {!active ? (
            <div className="select-muted">Selecione um personagem.</div>
          ) : (
            <div className="book">
              <div className="book-page">
                <img className="book-portrait" src="/assets/jogador_default.png" alt="" />

                <div className="book-row">
                  <div className="book-label">Nome</div>
                  <div className="book-value">{active.name || "—"}</div>
                </div>

                <div className="book-row">
                  <div className="book-label">Dono</div>
                  <div className="book-value">{active.owner_email || "—"}</div>
                </div>

                <div className="book-row">
                  <div className="book-label">Conceito</div>
                  <div className="book-value">{active.concept || "—"}</div>
                </div>

                <div className="book-row">
                  <div className="book-label">Backstory</div>
                  <div className="book-value book-multiline">{active.backstory || "—"}</div>
                </div>

                <div className="book-row">
                  <div className="book-label">Notas</div>
                  <div className="book-value book-multiline">{active.notes || "—"}</div>
                </div>

                <div className="book-row">
                  <div className="book-label">Sistemas</div>
                  <div className="book-value">{systemsLabel(active.systems || [active.system])}</div>
                </div>

                <div className="select-actions">
                  <button
                    className="ui-btn ui-btn--ghost"
                    onClick={() => active && onEdit?.(active)}
                    disabled={!active || !onEdit}
                    title={!onEdit ? "Edição não disponível" : ""}
                  >
                    Editar
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
