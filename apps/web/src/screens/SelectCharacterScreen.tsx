import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

type Character = {
  id: number;
  name: string;
  concept: string;
  system: string;
  backstory: string;
  notes: string;
  systems?: string[];
};

export function SelectCharacterScreen({
  onBack,
  onSelect,
  onEdit,
}: {
  onBack: () => void;
  onSelect: (c: Character) => void;
  onEdit?: (c: Character) => void;
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
        const list = await api<Character[]>("/api/me/characters");
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

  function portraitSrc(c: any): string {
  const fallback = "/assets/jogador_default.png";

  const direct =
    c?.portrait_url ??
    c?.portraitUrl ??
    c?.portrait ??
    c?.image_url ??
    c?.imageUrl ??
    c?.image ??
    null;

  const fromImages =
    Array.isArray(c?.images) && c.images.length
      ? (c.images[0]?.url ?? c.images[0]?.path ?? c.images[0]?.filename ?? c.images[0])
      : null;

  const raw = (typeof direct === "string" && direct.trim()) ? direct.trim()
           : (typeof fromImages === "string" && fromImages.trim()) ? fromImages.trim()
           : null;

  if (!raw) return fallback;
  if (/^https?:\/\//.test(raw) || raw.startsWith("/")) return raw;
  if (c?.id) return `/uploads/characters/${c.id}/${raw}`;

  return fallback;
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
                  <img className="book-portrait__img" src={portraitSrc(active)} alt="" />
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
