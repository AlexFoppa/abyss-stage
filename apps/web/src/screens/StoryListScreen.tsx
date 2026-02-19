import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

export type Story = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export function StoryListScreen({
  onBack,
  onOpenEditor,
}: {
  onBack: () => void;
  onOpenEditor: (storyId: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [stories, setStories] = useState<Story[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const active = useMemo(
    () => stories.find((s) => s.id === activeId) || null,
    [stories, activeId]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr(null);
      setLoading(true);
      try {
        const list = await api<Story[]>("/api/gm/stories");
        if (cancelled) return;
        setStories(Array.isArray(list) ? list : []);
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
                : "Falha ao carregar histórias";
        setErr(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleNewStory() {
    const name = window.prompt("Nome da nova história:");
    if (name == null || !name.trim()) return;

    setErr(null);
    setCreating(true);
    try {
      const created = await api<Story>("/api/gm/stories", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      setStories((prev) => [created, ...prev]);
      setActiveId(created.id);
      onOpenEditor(created.id);
    } catch (e: any) {
      const msg =
        typeof e?.message === "string"
          ? e.message
          : typeof e?.body?.detail === "string"
            ? e.body.detail
            : "Falha ao criar história";
      setErr(msg);
    } finally {
      setCreating(false);
    }
  }

  function formatDate(iso: string) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="select-scene">
      <div className="select-grid">
        <section className="ui-card select-col select-col--list">
          <div className="select-head">
            <h2 className="select-title">Histórias</h2>
          </div>

          {loading ? (
            <div className="select-muted">Carregando…</div>
          ) : stories.length === 0 ? (
            <div className="select-muted">Nenhuma história.</div>
          ) : (
            <div className="select-list">
              {stories.map((s) => {
                const isActive = s.id === activeId;
                return (
                  <button
                    key={s.id}
                    className={`select-item ${isActive ? "is-active" : ""}`}
                    onClick={() => setActiveId(s.id)}
                    type="button"
                  >
                    <div className="select-item-name">{s.name}</div>
                    <div className="select-item-sub">
                      Atualizado: {formatDate(s.updated_at)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="select-footer" style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
            <button className="ui-btn ui-btn--ghost" onClick={onBack} type="button">
              Voltar
            </button>
            <button
              className="ui-btn"
              onClick={handleNewStory}
              type="button"
              disabled={creating}
            >
              {creating ? "Criando…" : "Nova história"}
            </button>
          </div>

          {err && <div className="select-error">{err}</div>}
        </section>

        <section className="ui-card select-col select-col--book">
          <h2 className="select-title">História</h2>

          {!active ? (
            <div className="select-muted">Selecione uma história ou crie uma nova.</div>
          ) : (
            <div className="book">
              <div className="book-page">
                <div className="book-content">
                  <div className="book-row">
                    <div className="book-label">Nome</div>
                    <div className="book-value">{active.name || "—"}</div>
                  </div>
                  <div className="book-row">
                    <div className="book-label">Criada em</div>
                    <div className="book-value">{formatDate(active.created_at)}</div>
                  </div>
                  <div className="book-row">
                    <div className="book-label">Atualizada em</div>
                    <div className="book-value">{formatDate(active.updated_at)}</div>
                  </div>
                </div>
              </div>

              <div className="select-actions" style={{ display: "flex", gap: 10 }}>
                <button
                  className="ui-btn"
                  onClick={() => active && onOpenEditor(active.id)}
                  type="button"
                >
                  Abrir no editor
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
