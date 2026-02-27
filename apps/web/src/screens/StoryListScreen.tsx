import { useEffect, useMemo, useState, useCallback } from "react";
import { api } from "../api";

export type Story = {
  id: string;
  name: string;
  premissa?: string;
  o_que_aconteceu?: string;
  temas?: string;
  atmosfera?: string;
  notas?: string;
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
  const [editingDetail, setEditingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Story | null>(null);

  const active = useMemo(
    () => stories.find((s) => s.id === activeId) || null,
    [stories, activeId]
  );

  const loadStoryDetail = useCallback(async (storyId: string) => {
    try {
      const s = await api<Story>(`/api/gm/stories/${storyId}`);
      setStories((prev) => prev.map((x) => (x.id === storyId ? { ...x, ...s } : x)));
    } catch {
      // keep list data
    }
  }, []);

  useEffect(() => {
    if (activeId) loadStoryDetail(activeId);
  }, [activeId, loadStoryDetail]);

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

  function startEditing() {
    if (active) {
      setDraft({ ...active });
      setEditingDetail(true);
    }
  }

  function cancelEditing() {
    setEditingDetail(false);
    setDraft(null);
  }

  async function saveEditing() {
    if (!draft) return;
    setErr(null);
    setSaving(true);
    try {
      const updated = await api<Story>(`/api/gm/stories/${draft.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: draft.name,
          premissa: draft.premissa ?? "",
          o_que_aconteceu: draft.o_que_aconteceu ?? "",
          temas: draft.temas ?? "",
          atmosfera: draft.atmosfera ?? "",
          notas: draft.notas ?? "",
        }),
      });
      setStories((prev) => prev.map((s) => (s.id === draft.id ? updated : s)));
      setEditingDetail(false);
      setDraft(null);
    } catch (e: any) {
      const msg =
        typeof e?.message === "string"
          ? e.message
          : typeof e?.body?.detail === "string"
            ? e.body.detail
            : "Falha ao salvar";
      setErr(msg);
    } finally {
      setSaving(false);
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
                  {!editingDetail ? (
                    <>
                      <div className="book-row">
                        <div className="book-label">Nome</div>
                        <div className="book-value">{active.name || "—"}</div>
                      </div>
                      <div className="book-row">
                        <div className="book-label">Premissa</div>
                        <div className="book-value book-value--block">{active.premissa || "—"}</div>
                      </div>
                      <div className="book-row">
                        <div className="book-label">O que realmente aconteceu</div>
                        <div className="book-value book-value--block">{active.o_que_aconteceu || "—"}</div>
                      </div>
                      <div className="book-row">
                        <div className="book-label">Temas</div>
                        <div className="book-value">{active.temas || "—"}</div>
                      </div>
                      <div className="book-row">
                        <div className="book-label">Atmosfera</div>
                        <div className="book-value">{active.atmosfera || "—"}</div>
                      </div>
                      <div className="book-row">
                        <div className="book-label">Notas</div>
                        <div className="book-value book-value--block">{active.notas || "—"}</div>
                      </div>
                      <div className="book-row">
                        <div className="book-label">Criada em</div>
                        <div className="book-value">{formatDate(active.created_at)}</div>
                      </div>
                      <div className="book-row">
                        <div className="book-label">Atualizada em</div>
                        <div className="book-value">{formatDate(active.updated_at)}</div>
                      </div>
                    </>
                  ) : draft ? (
                    <>
                      <div className="book-row">
                        <div className="book-label">Nome</div>
                        <input
                          type="text"
                          className="ui-field book-input"
                          value={draft.name}
                          onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : null))}
                        />
                      </div>
                      <div className="book-row">
                        <div className="book-label">Premissa</div>
                        <textarea
                          className="ui-field book-textarea"
                          rows={4}
                          value={draft.premissa ?? ""}
                          onChange={(e) => setDraft((d) => (d ? { ...d, premissa: e.target.value } : null))}
                        />
                      </div>
                      <div className="book-row">
                        <div className="book-label">O que realmente aconteceu</div>
                        <textarea
                          className="ui-field book-textarea"
                          rows={4}
                          value={draft.o_que_aconteceu ?? ""}
                          onChange={(e) => setDraft((d) => (d ? { ...d, o_que_aconteceu: e.target.value } : null))}
                        />
                      </div>
                      <div className="book-row">
                        <div className="book-label">Temas</div>
                        <input
                          type="text"
                          className="ui-field book-input"
                          value={draft.temas ?? ""}
                          onChange={(e) => setDraft((d) => (d ? { ...d, temas: e.target.value } : null))}
                        />
                      </div>
                      <div className="book-row">
                        <div className="book-label">Atmosfera</div>
                        <input
                          type="text"
                          className="ui-field book-input"
                          value={draft.atmosfera ?? ""}
                          onChange={(e) => setDraft((d) => (d ? { ...d, atmosfera: e.target.value } : null))}
                        />
                      </div>
                      <div className="book-row">
                        <div className="book-label">Notas</div>
                        <textarea
                          className="ui-field book-textarea"
                          rows={4}
                          value={draft.notas ?? ""}
                          onChange={(e) => setDraft((d) => (d ? { ...d, notas: e.target.value } : null))}
                        />
                      </div>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="select-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {!editingDetail ? (
                  <>
                    <button
                      className="ui-btn"
                      onClick={() => active && onOpenEditor(active.id)}
                      type="button"
                      title="Abrir no editor de cenas"
                    >
                      <span className="book-btn-icon" aria-hidden>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 19l7-7 3 3-7 7-3-3z" />
                          <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                          <path d="M2 2l7.586 7.586" />
                          <circle cx="11" cy="11" r="2" />
                        </svg>
                      </span>
                      Continuar Escrevendo
                    </button>
                    <button
                      className="ui-btn ui-btn--ghost"
                      onClick={startEditing}
                      type="button"
                    >
                      Editar
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="ui-btn"
                      onClick={saveEditing}
                      type="button"
                      disabled={saving}
                    >
                      {saving ? "Salvando…" : "Salvar"}
                    </button>
                    <button
                      className="ui-btn ui-btn--ghost"
                      onClick={cancelEditing}
                      type="button"
                      disabled={saving}
                    >
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
