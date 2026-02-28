import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { scenarioCropFromScenario, scenarioImageUrl as getScenarioImageUrl } from "../scenarioCrop";
import type { CropRect } from "../scenarioCrop";
import { ScenarioBackground } from "./SceneStagePreview";
import { ScenarioCropEditor } from "./ScenarioCropEditor";

export type GMScenario = {
  id: string;
  name: string;
  description: string;
  image_storage_key: string | null;
  crop_x?: number | null;
  crop_y?: number | null;
  crop_width?: number | null;
  crop_height?: number | null;
  created_at: string;
  updated_at: string;
};

function scenarioImageUrl(s: GMScenario): string | null {
  return getScenarioImageUrl(s);
}

function scenarioCrop(s: GMScenario): CropRect | null {
  return scenarioCropFromScenario(s);
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
  /** 'create' = formulário novo cenário; string = id do cenário em edição; null = vista somente leitura */
  const [formMode, setFormMode] = useState<"create" | string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const active = scenarios.find((s) => s.id === activeId) ?? null;
  const isEditing = typeof formMode === "string" && formMode !== "create";
  const editingScenario = isEditing ? scenarios.find((s) => s.id === formMode) ?? null : null;
  const isCreating = formMode === "create";

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      const list = await api<GMScenario[]>("/api/gm/scenarios");
      setScenarios(Array.isArray(list) ? list : []);
      setActiveId((prev) => (prev && list?.some((s) => s.id === prev)) ? prev : (list?.[0]?.id ?? null));
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

  useEffect(() => {
    if (formMode === "create") {
      setName("");
      setDescription("");
      setCrop(null);
      setPendingImageFile(null);
      if (pendingImageUrl) {
        URL.revokeObjectURL(pendingImageUrl);
        setPendingImageUrl(null);
      }
      return;
    }
    if (typeof formMode === "string" && formMode !== "create") {
      const s = scenarios.find((sc) => sc.id === formMode);
      if (s) {
        setName(s.name);
        setDescription(s.description ?? "");
        setCrop(scenarioCrop(s));
        setPendingImageFile(null);
        if (pendingImageUrl) {
          URL.revokeObjectURL(pendingImageUrl);
          setPendingImageUrl(null);
        }
      }
    }
  }, [formMode]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (isEditing && editingScenario) {
      setErr(null);
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const updated = await api<GMScenario>(`/api/gm/scenarios/${editingScenario.id}/image`, {
          method: "POST",
          body: form,
        });
        setScenarios((prev) => prev.map((s) => (s.id === editingScenario.id ? updated : s)));
        setCrop(scenarioCrop(updated));
      } catch (e: unknown) {
        const msg =
          e && typeof (e as { message?: string })?.message === "string"
            ? (e as { message: string }).message
            : "Falha ao enviar imagem";
        setErr(msg);
      } finally {
        setUploading(false);
      }
      return;
    }
    if (isCreating) {
      if (pendingImageUrl) URL.revokeObjectURL(pendingImageUrl);
      setPendingImageFile(file);
      setPendingImageUrl(URL.createObjectURL(file));
      setCrop(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setErr(null);
    setSaving(true);
    try {
      if (isEditing && editingScenario) {
        const body: Record<string, unknown> = { name: name.trim(), description: description.trim() };
        if (crop && crop.width > 0 && crop.height > 0) {
          body.crop_x = crop.x;
          body.crop_y = crop.y;
          body.crop_width = crop.width;
          body.crop_height = crop.height;
        }
        await api<GMScenario>(`/api/gm/scenarios/${editingScenario.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        setFormMode(null);
        await load();
      } else if (isCreating) {
        const created = await api<GMScenario>("/api/gm/scenarios", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), description: description.trim() }),
        });
        setScenarios((prev) => [created, ...prev]);
        setActiveId(created.id);
        if (pendingImageFile) {
          setUploading(true);
          try {
            const form = new FormData();
            form.append("file", pendingImageFile);
            const withImage = await api<GMScenario>(`/api/gm/scenarios/${created.id}/image`, {
              method: "POST",
              body: form,
            });
            setScenarios((prev) => prev.map((s) => (s.id === created.id ? withImage : s)));
            if (crop && crop.width > 0 && crop.height > 0) {
              const withCrop = await api<GMScenario>(`/api/gm/scenarios/${created.id}`, {
                method: "PUT",
                body: JSON.stringify({
                  name: name.trim(),
                  description: description.trim(),
                  crop_x: crop.x,
                  crop_y: crop.y,
                  crop_width: crop.width,
                  crop_height: crop.height,
                }),
              });
              setScenarios((prev) => prev.map((s) => (s.id === created.id ? withCrop : s)));
            }
          } catch (e: unknown) {
            const msg =
              e && typeof (e as { message?: string })?.message === "string"
                ? (e as { message: string }).message
                : "Falha ao enviar imagem";
            setErr(msg);
          } finally {
            setUploading(false);
          }
          setPendingImageFile(null);
          if (pendingImageUrl) {
            URL.revokeObjectURL(pendingImageUrl);
            setPendingImageUrl(null);
          }
        }
        setFormMode(null);
      }
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

  function startEdit(id: string) {
    setFormMode(id);
  }

  function startCreate() {
    setFormMode("create");
  }

  function cancelForm() {
    setFormMode(null);
    if (pendingImageUrl) {
      URL.revokeObjectURL(pendingImageUrl);
      setPendingImageUrl(null);
    }
    setPendingImageFile(null);
  }

  const detailFormUrl = isCreating
    ? pendingImageUrl
    : editingScenario
      ? scenarioImageUrl(editingScenario)
      : null;

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
                    onClick={() => {
                      if (!isEditing && !isCreating) setActiveId(s.id);
                    }}
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

          {(isCreating || isEditing) ? (
            <form className="scenario-manager__form scenario-detail-view__form" onSubmit={handleSubmit}>
              <label className="ui-label">{isEditing ? "Editar cenário" : "Novo cenário"}</label>
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
                Imagem
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="ui-field"
                style={{ display: "none" }}
                onChange={handleImageChange}
              />
              <div className="scenario-manager__form-image">
                {detailFormUrl ? (
                  <>
                    <ScenarioCropEditor imageUrl={detailFormUrl} crop={crop} onChange={setCrop} />
                    {isEditing && (
                      <button
                        type="button"
                        className="ui-btn ui-btn--ghost"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        style={{ marginTop: 8 }}
                      >
                        {uploading ? "Enviando…" : "Trocar imagem"}
                      </button>
                    )}
                    {isCreating && (
                      <button
                        type="button"
                        className="ui-btn ui-btn--ghost"
                        onClick={() => fileInputRef.current?.click()}
                        style={{ marginTop: 8 }}
                      >
                        {pendingImageFile ? `${pendingImageFile.name} (clique para trocar)` : "Adicionar imagem (opcional)"}
                      </button>
                    )}
                  </>
                ) : (
                  (isEditing && (
                    <button
                      type="button"
                      className="ui-btn ui-btn--ghost"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? "Enviando…" : "Adicionar imagem"}
                    </button>
                  )) ||
                  (isCreating && (
                    <button type="button" className="ui-btn ui-btn--ghost" onClick={() => fileInputRef.current?.click()}>
                      Adicionar imagem (opcional)
                    </button>
                  ))
                )}
              </div>
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
              <div className="ui-actions" style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button type="submit" className="ui-btn" disabled={saving || uploading}>
                  {saving ? "Salvando…" : uploading ? "Enviando…" : isEditing ? "Salvar" : "Criar"}
                </button>
                <button type="button" className="ui-btn ui-btn--ghost" onClick={cancelForm}>
                  Cancelar
                </button>
              </div>
            </form>
          ) : !active ? (
            <div className="select-muted">Selecione um cenário ou crie um novo.</div>
          ) : (
            <div className="scenario-detail-view">
              <div className="scenario-detail-view__name">{active.name || "—"}</div>
              <div className="scenario-detail-view__preview-wrap" role="img" aria-label={`Prévia do cenário ${active.name}`}>
                {scenarioImageUrl(active) ? (
                  <ScenarioBackground
                    imageUrl={scenarioImageUrl(active)!}
                    crop={scenarioCrop(active)}
                    className="scenario-detail-view__preview scenario-detail-view__preview--with-crop"
                  />
                ) : (
                  <div className="scenario-detail__placeholder scenario-detail-view__placeholder">
                    Sem imagem
                  </div>
                )}
              </div>
              <label className="ui-label" style={{ marginTop: 12 }}>
                Descrição (pré-preenche a cena)
              </label>
              <div className="scenario-detail-view__description">{active.description || "—"}</div>
              <div className="select-actions" style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button className="ui-btn" onClick={() => startEdit(active.id)} type="button">
                  Editar
                </button>
                <button
                  className="ui-btn ui-btn--ghost"
                  onClick={() => {
                    if (!window.confirm(`Excluir o cenário "${active.name}"?\n\nCenas que o usam ficarão sem cenário.`)) return;
                    setErr(null);
                    setDeletingId(active.id);
                    api(`/api/gm/scenarios/${active.id}`, { method: "DELETE" })
                      .then(() => {
                        setScenarios((prev) => prev.filter((x) => x.id !== active.id));
                        setActiveId((prev) => (prev === active.id ? null : prev));
                      })
                      .catch((e: unknown) => {
                        const msg =
                          e && typeof (e as { message?: string })?.message === "string"
                            ? (e as { message: string }).message
                            : "Falha ao excluir";
                        setErr(msg);
                      })
                      .finally(() => setDeletingId(null));
                  }}
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
