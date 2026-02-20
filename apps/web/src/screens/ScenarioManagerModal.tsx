import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";

export type Scenario = {
  id: string;
  name: string;
  description: string;
  image_storage_key: string | null;
  created_at: string;
  updated_at: string;
};

export function ScenarioManagerModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setFormOpen(false);
    setEditingId(null);
    setName("");
    setDescription("");
    (async () => {
      setLoading(true);
      try {
        const list = await api<Scenario[]>("/api/gm/scenarios");
        setScenarios(Array.isArray(list) ? list : []);
      } catch (e: unknown) {
        const msg =
          e && typeof (e as { message?: string })?.message === "string"
            ? (e as { message: string }).message
            : "Falha ao carregar cenários";
        setErr(msg);
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (formOpen) {
          setFormOpen(false);
          setEditingId(null);
        } else onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, formOpen, onClose]);

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
        const created = await api<Scenario>("/api/gm/scenarios", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), description: description.trim() }),
        });
        setScenarios((prev) => [created, ...prev]);
      }
      setFormOpen(false);
      setEditingId(null);
      setName("");
      setDescription("");
      onSaved?.();
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

  function startEdit(s: Scenario) {
    setEditingId(s.id);
    setName(s.name);
    setDescription(s.description);
    setFormOpen(true);
  }

  function startCreate() {
    setEditingId(null);
    setName("");
    setDescription("");
    setFormOpen(true);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Excluir este cenário? Cenas que o usam ficarão sem cenário.")) return;
    setDeletingId(id);
    setErr(null);
    try {
      await api(`/api/gm/scenarios/${id}`, { method: "DELETE" });
      setScenarios((prev) => prev.filter((s) => s.id !== id));
      onSaved?.();
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

  if (!open) return null;

  const dialog = (
    <div className="ui-modal" role="dialog" aria-modal="true" aria-label="Gerenciar cenários">
      <button className="ui-modal__backdrop" onClick={onClose} aria-label="Fechar" />
      <div className="ui-modal__card ui-card scenario-manager">
        <h3 className="ui-modal__title">Cenários</h3>

        {err && <p className="scenario-manager__error">{err}</p>}

        <div className="scenario-manager__toolbar">
          <button type="button" className="ui-btn ui-btn--primary" onClick={startCreate}>
            Novo cenário
          </button>
        </div>

        {formOpen && (
          <form className="scenario-manager__form" onSubmit={handleSubmit}>
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
            <label className="ui-label" style={{ marginTop: 10 }}>
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
                onClick={() => { setFormOpen(false); setEditingId(null); }}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="story-editor__placeholder">Carregando cenários…</p>
        ) : (
          <ul className="scenario-manager__list">
            {scenarios.map((s) => (
              <li key={s.id} className="scenario-manager__item">
                <div className="scenario-manager__item-body">
                  <strong>{s.name || "(sem nome)"}</strong>
                  {s.description ? (
                    <span className="scenario-manager__item-desc">{s.description.slice(0, 80)}{s.description.length > 80 ? "…" : ""}</span>
                  ) : null}
                </div>
                <div className="scenario-manager__item-actions">
                  <button
                    type="button"
                    className="ui-btn ui-btn--ghost"
                    onClick={() => startEdit(s)}
                    style={{ width: "auto", padding: "0 10px" }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="ui-btn ui-btn--ghost"
                    onClick={() => handleDelete(s.id)}
                    disabled={deletingId === s.id}
                    style={{ width: "auto", padding: "0 10px" }}
                  >
                    {deletingId === s.id ? "Excluindo…" : "Excluir"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {!loading && scenarios.length === 0 && !formOpen && (
          <p className="story-editor__placeholder">Nenhum cenário. Clique em &quot;Novo cenário&quot;.</p>
        )}

        <div className="ui-actions ui-modal__actions" style={{ marginTop: 16 }}>
          <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
