import { useEffect, useRef, useState } from "react";
import { api } from "../api";

export type GMScenario = {
  id: string;
  name: string;
  description: string;
  image_storage_key: string | null;
  created_at: string;
  updated_at: string;
};

function scenarioImageUrl(s: GMScenario): string | null {
  if (!s.image_storage_key) return null;
  return `/uploads/${s.image_storage_key}`;
}

export function GMScenariosScreen({
  onBack,
}: {
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<GMScenario[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const active = scenarios.find((s) => s.id === activeId) ?? null;

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      const list = await api<GMScenario[]>("/api/gm/scenarios");
      setScenarios(Array.isArray(list) ? list : []);
      setActiveId((Array.isArray(list) && list[0]?.id) || null);
    } catch (e: unknown) {
      const msg =
        e && typeof (e as { message?: string })?.message === "string"
          ? (e as { message: string }).message
          : "Falha ao carregar cenários";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(s: GMScenario) {
    if (!window.confirm(`Excluir o cenário "${s.name}"?\n\nCenas que o usam ficarão sem cenário.`)) return;
    setErr(null);
    setDeletingId(s.id);
    try {
      await api(`/api/gm/scenarios/${s.id}`, { method: "DELETE" });
      setScenarios((prev) => prev.filter((x) => x.id !== s.id));
      setActiveId((prev) => (prev === s.id ? null : prev));
    } catch (e: unknown) {
      const msg =
        e && typeof (e as { message?: string })?.message === "string"
          ? (e as { message: string }).message
          : "Falha ao excluir";
      setErr(msg);
    } finally {
      setDeletingId(null);
    }
  }

  function startEdit(s: GMScenario) {
    setEditingId(s.id);
    setName(s.name);
    setDescription(s.description ?? "");
    setFormOpen(true);
  }

  function startCreate() {
    setEditingId(null);
    setName("");
    setDescription("");
    setFormOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setErr(null);
    setSaving(true);
    try {
      if (editingId) {
        await api(`/api/gm/scenarios/${editingId}`, {
          method: "PUT",
          body: JSON.stringify({ name: name.trim(), description: description.trim() }),
        });
        setScenarios((prev) =>
          prev.map((s) =>
            s.id === editingId
              ? { ...s, name: name.trim(), description: description.trim() }
              : s
          )
        );
      } else {
        const created = await api<GMScenario>("/api/gm/scenarios", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), description: description.trim() }),
        });
        setScenarios((prev) => [created, ...prev]);
        setActiveId(created.id);
      }
      setFormOpen(false);
      setEditingId(null);
      setName("");
      setDescription("");
    } catch (e: unknown) {
      const msg =
        e && typeof (e as { message?: string })?.message === "string"
          ? (e as { message: string }).message
          : "Falha ao salvar";
      setErr(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeId) return;
    setErr(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const updated = await api<GMScenario>(`/api/gm/scenarios/${activeId}/image`, {
        method: "POST",
        body: form,
      });
      setScenarios((prev) => prev.map((s) => (s.id === activeId ? updated : s)));
    } catch (e: unknown) {
      const msg =
        e && typeof (e as { message?: string })?.message === "string"
          ? (e as { message: string }).message
          : "Falha ao enviar imagem";
      setErr(msg);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="select-scene gm-scenarios-screen">
      <div className="select-grid">
        <section className="ui-card select-col select-col--list">
          <div className="select-head">
            <h2 className="select-title">Cenários</h2>
          </div>

          {loading ? (
            <div className="select-muted">Carregando…</div>
          ) : scenarios.length === 0 ? (
            <div className="select-muted">Nenhum cenário encontrado.</div>
          ) : (
            <div className="select-list">
              {scenarios.map((s) => {
                const isActive = s.id === activeId;
                return (
                  <button
                    key={s.id}
                    className={`select-item ${isActive ? "is-active" : ""}`}
                    onClick={() => setActiveId(s.id)}
                    type="button"
                  >
                    <div className="select-item-name">{s.name || "(sem nome)"}</div>
                    {s.description ? (
                      <div className="select-item-sub">
                        {s.description.slice(0, 60)}
                        {s.description.length > 60 ? "…" : ""}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}

          <div className="select-footer" style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
            <button className="ui-btn ui-btn--ghost" onClick={onBack} type="button">
              Voltar
            </button>
            <button className="ui-btn" onClick={startCreate} type="button">
              Criar
            </button>
          </div>

          {err && <div className="select-error">{err}</div>}
        </section>

        <section className="ui-card select-col select-col--book">
          <h2 className="select-title">Detalhe</h2>

          {formOpen ? (
            <form className="scenario-manager__form" onSubmit={handleSubmit} style={{ marginTop: 12 }}>
              <p className="ui-label">{editingId ? "Editar cenário" : "Novo cenário"}</p>
              <input
                type="text"
                className="ui-field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome do cenário"
                required
                autoFocus
              />
              {editingId && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="ui-field"
                    style={{ display: "none" }}
                    onChange={handleImageChange}
                  />
                  <div className="scenario-form__image-wrap">
                    {active && scenarioImageUrl(active) ? (
                      <>
                        <img src={scenarioImageUrl(active)!} alt="" className="scenario-form__image" />
                        <button
                          type="button"
                          className="ui-btn ui-btn--ghost"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading}
                          style={{ marginTop: 8 }}
                        >
                          {uploading ? "Enviando…" : "Trocar imagem"}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="ui-btn ui-btn--ghost"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                      >
                        {uploading ? "Enviando…" : "Adicionar imagem"}
                      </button>
                    )}
                  </div>
                </>
              )}
              <label className="ui-label" style={{ marginTop: 12 }}>
                Descrição (pré-preenche a cena)
              </label>
              <textarea
                className="ui-field"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrição opcional"
                rows={3}
              />
              <div className="ui-actions" style={{ marginTop: 12 }}>
                <button type="submit" className="ui-btn" disabled={saving}>
                  {saving ? "Salvando…" : editingId ? "Salvar" : "Criar"}
                </button>
                <button
                  type="button"
                  className="ui-btn ui-btn--ghost"
                  onClick={() => {
                    setFormOpen(false);
                    setEditingId(null);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : !active ? (
            <div className="select-muted">Selecione um cenário.</div>
          ) : (
            <div className="scenario-detail-view">
              <div className="scenario-detail-view__name">{active.name || "—"}</div>
              <div className="scenario-form__image-wrap">
                {scenarioImageUrl(active) ? (
                  <img
                    className="scenario-form__image"
                    src={scenarioImageUrl(active)!}
                    alt=""
                  />
                ) : (
                  <div className="scenario-detail__placeholder scenario-detail-view__placeholder">
                    Sem imagem
                  </div>
                )}
              </div>
              <label className="ui-label" style={{ marginTop: 12 }}>Descrição (pré-preenche a cena)</label>
              <div className="scenario-detail-view__description">{active.description || "—"}</div>
              <div className="select-actions" style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button
                  className="ui-btn"
                  onClick={() => startEdit(active)}
                  type="button"
                >
                  Editar
                </button>
                <button
                  className="ui-btn ui-btn--ghost"
                  onClick={() => handleDelete(active)}
                  disabled={deletingId === active.id}
                  type="button"
                >
                  {deletingId === active.id ? "Excluindo…" : "Excluir"}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
