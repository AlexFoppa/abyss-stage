import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { Character } from "../types/character";
import { getAvatarUrl } from "../utils/avatar";

export function SelectCharacterScreen({
  onBack,
  onSelect,
  onEdit,
  messageWhenShowActive,
  listSource = "me",
}: {
  onBack: () => void;
  onSelect: (c: Character) => void;
  onEdit?: (c: Character) => void;
  /** Ex.: "Há um espetáculo em andamento. Selecione um personagem para entrar." */
  messageWhenShowActive?: string;
  /** `me` = /api/me/characters (jogador); `gm` = /api/gm/characters (mestre, todos os da mesa). */
  listSource?: "me" | "gm";
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [chars, setChars] = useState<Character[]>([]);
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
        const path = listSource === "gm" ? "/api/gm/characters" : "/api/me/characters";
        const list = await api<Character[]>(path);
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
  }, [listSource]);

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
            <h2 className="select-title">{listSource === "gm" ? "Personagens da mesa" : "Personagens"}</h2>
          </div>
          {messageWhenShowActive ? (
            <p className="select-muted select-message-show-active" role="status">
              {messageWhenShowActive}
            </p>
          ) : null}
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
                    <div className="select-item-name">{c.name}</div>
                    <div className="select-item-sub">{systemsLabel(c.systems || [c.system])}</div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="select-footer">
            <button className="ui-btn ui-btn--ghost" onClick={onBack} type="button">
              Voltar
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
                <div className="book-portrait">
                  <img className="book-portrait__img" src={getAvatarUrl(active ?? undefined)} alt="" />
                </div>

                <div className="book-content">
                  <div className="book-row">
                    <div className="book-label">Nome</div>
                    <div className="book-value">{active.name || "—"}</div>
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
                </div>

                <div className="select-actions">
                  <button
                    className="ui-btn"
                    onClick={() => {
                      onSelect(active);
                      onBack();
                    }}
                    disabled={!active}
                    type="button"
                  >
                    Selecionar
                  </button>

                  <button
                    className="ui-btn ui-btn--ghost"
                    onClick={() => active && onEdit?.(active)}
                    disabled={!active || !onEdit}
                    title={!onEdit ? "Edição não disponível" : ""}
                    type="button"
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
