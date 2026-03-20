import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import { scenarioImageUrl as getScenarioImageUrl } from "../scenarioCrop";
import { ScenarioCropEditor } from "./ScenarioCropEditor";

export type Scenario = {
  id: string;
  name: string;
  description: string;
  image_storage_key: string | null;
  /** Recorte no palco (0–1): canto superior esquerdo e tamanho. Se null, usa imagem inteira. */
  crop_x?: number | null;
  crop_y?: number | null;
  crop_width?: number | null;
  crop_height?: number | null;
  created_at: string;
  updated_at: string;
};

function scenarioImageUrl(s: Scenario): string | null {
  return getScenarioImageUrl(s);
}

function ScenarioTooltipContent({ scenario, className }: { scenario: Scenario; className?: string }) {
  return (
    <div className={className ?? "scenario-manager__polaroid-tooltip"}>
      <div className="scene-chars-tooltip__row">
        <div className="scene-chars-tooltip__label">Nome</div>
        <div className="scene-chars-tooltip__value">{scenario.name || "—"}</div>
      </div>
      <div className="scene-chars-tooltip__row">
        <div className="scene-chars-tooltip__label">Descrição</div>
        <div className="scene-chars-tooltip__value">{scenario.description || "—"}</div>
      </div>
    </div>
  );
}

function EditPencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 5L5 18M5 18l3 3" />
      <line x1="3" y1="22" x2="15" y2="22" />
    </svg>
  );
}

export function ScenarioManagerModal({
  open,
  onClose,
  onSaved,
  onRequestCreateScenario,
  usedInStoryScenarioIds,
  onAddScenarioToStory,
  onRemoveScenarioFromStory,
  /** Quando definido, abre o formulário ao carregar: 'create' = novo cenário; string = editar esse id. */
  initialAction,
  /** Chamado após aplicar initialAction (para o pai limpar initialAction). */
  onInitialActionApplied,
  /** true = uma única lista "Cenários" (ex.: tela Cenários do GM). */
  singleList,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  /** Se definido, "Novo cenário" fecha o modal e chama isto (telas de criação padrão). */
  onRequestCreateScenario?: () => void;
  /** IDs de cenários na história (usados em cenas ou adicionados). */
  usedInStoryScenarioIds?: string[];
  /** No roteiro: adicionar cenário à história (sem exclusão). */
  onAddScenarioToStory?: (scenarioId: string) => void;
  /** No roteiro: remover cenário da história (desvincula das cenas, sem exclusão). */
  onRemoveScenarioFromStory?: (scenarioId: string) => Promise<void>;
  initialAction?: "create" | string | null;
  onInitialActionApplied?: () => void;
  singleList?: boolean;
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
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ scenario: Scenario; x: number; y: number } | null>(null);
  const tooltipLeaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedInitialActionRef = useRef<string | boolean>(false);
  const TOOLTIP_W = 320;
  const TOOLTIP_GAP = 8;
  function placeBeside(rect: DOMRect) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    let x: number;
    if (rect.right + TOOLTIP_GAP + TOOLTIP_W <= w) x = rect.right + TOOLTIP_GAP;
    else if (rect.left - TOOLTIP_GAP - TOOLTIP_W >= 0) x = rect.left - TOOLTIP_W - TOOLTIP_GAP;
    else x = Math.max(TOOLTIP_GAP, w - TOOLTIP_W - TOOLTIP_GAP);
    const y = Math.max(TOOLTIP_GAP, Math.min(rect.top, h - 400 - 16));
    return { x, y };
  }
  const [uploading, setUploading] = useState(false);
  const isStoryEditor = Boolean(onAddScenarioToStory && onRemoveScenarioFromStory);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [crop, setCrop] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const usedSet = new Set(usedInStoryScenarioIds ?? []);
  const inStory = scenarios.filter((s) => usedSet.has(s.id));
  const notInStory = scenarios.filter((s) => !usedSet.has(s.id));
  const allScenarios = singleList ? scenarios : notInStory;

  useEffect(() => {
    if (!open) {
      setTooltip(null);
      appliedInitialActionRef.current = false;
      return;
    }
    setErr(null);
    setEditingId(null);
    setName("");
    setDescription("");
    setPendingImageFile(null);
    setCrop(null);
    setFormOpen(Boolean(initialAction));
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
  }, [open, initialAction]);

  useEffect(() => {
    if (!open || loading || !initialAction || appliedInitialActionRef.current === initialAction) return;
    appliedInitialActionRef.current = initialAction;
    if (initialAction === "create") {
      setFormOpen(true);
      setEditingId(null);
      setName("");
      setDescription("");
      setCrop(null);
      onInitialActionApplied?.();
      return;
    }
    const s = scenarios.find((sc) => sc.id === initialAction);
    if (s) {
      setEditingId(s.id);
      setName(s.name);
      setDescription(s.description ?? "");
      const wx = Number(s.crop_width);
      const hx = Number(s.crop_height);
      if (Number.isFinite(Number(s.crop_x)) && Number.isFinite(Number(s.crop_y)) && wx > 0 && wx <= 1 && hx > 0 && hx <= 1) {
        setCrop({
          x: Number(s.crop_x),
          y: Number(s.crop_y),
          width: wx,
          height: hx,
        });
      } else {
        setCrop(null);
      }
      setFormOpen(true);
    }
    onInitialActionApplied?.();
  }, [open, loading, initialAction, scenarios, onInitialActionApplied]);

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

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (editingId) {
      setErr(null);
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const updated = await api<Scenario>(`/api/gm/scenarios/${editingId}/image`, {
          method: "POST",
          body: form,
        });
        setScenarios((prev) => prev.map((s) => (s.id === editingId ? updated : s)));
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
    } else {
      setPendingImageFile(file);
    }
    e.target.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setErr(null);
    setSaving(true);
    try {
      if (editingId) {
        const body: Record<string, unknown> = { name: name.trim(), description: description.trim() };
        if (crop && Number(crop.width) > 0 && Number(crop.height) > 0) {
          body.crop_x = Number(crop.x);
          body.crop_y = Number(crop.y);
          body.crop_width = Number(crop.width);
          body.crop_height = Number(crop.height);
        }
        const updated = await api<Scenario>(`/api/gm/scenarios/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        setScenarios((prev) =>
          prev.map((s) => (s.id === editingId ? { ...s, ...updated } : s))
        );
      } else {
        const created = await api<Scenario>("/api/gm/scenarios", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), description: description.trim() }),
        });
        setScenarios((prev) => [created, ...prev]);
        if (pendingImageFile) {
          setUploading(true);
          try {
            const form = new FormData();
            form.append("file", pendingImageFile);
            const updated = await api<Scenario>(`/api/gm/scenarios/${created.id}/image`, {
              method: "POST",
              body: form,
            });
            setScenarios((prev) => prev.map((s) => (s.id === created.id ? updated : s)));
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
        }
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
    const wx = Number(s.crop_width);
    const hx = Number(s.crop_height);
    if (Number.isFinite(Number(s.crop_x)) && Number.isFinite(Number(s.crop_y)) && wx > 0 && wx <= 1 && hx > 0 && hx <= 1) {
      setCrop({
        x: Number(s.crop_x),
        y: Number(s.crop_y),
        width: wx,
        height: hx,
      });
    } else {
      setCrop(null);
    }
    setFormOpen(true);
  }

  function startCreate() {
    setEditingId(null);
    setName("");
    setDescription("");
    setCrop(null);
    setFormOpen(true);
  }

  async function handleRemoveFromStory(id: string) {
    if (!onRemoveScenarioFromStory) return;
    setRemovingId(id);
    setErr(null);
    try {
      await onRemoveScenarioFromStory(id);
      onSaved?.();
    } catch (e: unknown) {
      const msg =
        e && typeof (e as { message?: string })?.message === "string"
          ? (e as { message: string }).message
          : "Falha ao remover da história";
      setErr(msg);
    } finally {
      setRemovingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Excluir permanentemente este cenário? Esta ação não pode ser desfeita.")) return;
    setDeletingId(id);
    setErr(null);
    try {
      await api(`/api/gm/scenarios/${id}`, { method: "DELETE" });
      setScenarios((prev) => prev.filter((s) => s.id !== id));
      onSaved?.();
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status;
      const msg =
        e && typeof (e as { message?: string })?.message === "string"
          ? (e as { message: string }).message
          : "Falha ao excluir";
      setErr(msg);
      if (status === 404) {
        setScenarios((prev) => prev.filter((s) => s.id !== id));
        onSaved?.();
      }
    } finally {
      setDeletingId(null);
    }
  }

  if (!open) return null;

  const modalTitle =
    formOpen && (singleList || editingId)
      ? editingId
        ? "Editar cenário"
        : "Novo cenário"
      : "Gerenciar cenários";

  const dialog = (
    <div className="ui-modal" role="dialog" aria-modal="true" aria-label={modalTitle}>
      <button className="ui-modal__backdrop" onClick={onClose} aria-label="Fechar" />
      <div className="ui-modal__card ui-card scenario-manager scenario-manager--polaroid">
        <h3 className="ui-modal__title">{modalTitle}</h3>

        {err && <p className="scenario-manager__error">{err}</p>}

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
              {editingId ? (
                (() => {
                  const scenario = scenarios.find((s) => s.id === editingId);
                  const imgUrl = scenario ? scenarioImageUrl(scenario) : null;
                  return imgUrl ? (
                    <>
                      <ScenarioCropEditor imageUrl={imgUrl} crop={crop} onChange={setCrop} />
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
                  );
                })()
              ) : (
                <button
                  type="button"
                  className="ui-btn ui-btn--ghost"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {pendingImageFile ? `${pendingImageFile.name} (clique para trocar)` : "Adicionar imagem (opcional)"}
                </button>
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
            <div className="ui-actions" style={{ marginTop: 12 }}>
              <button type="submit" className="ui-btn" disabled={saving || uploading}>
                {saving ? "Salvando…" : uploading ? "Enviando…" : editingId ? "Salvar" : "Criar"}
              </button>
              <button
                type="button"
                className="ui-btn ui-btn--ghost"
                onClick={() => { setFormOpen(false); setEditingId(null); setPendingImageFile(null); }}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {!formOpen && (
          <>
            <div className="scenario-manager__scroll">
            {loading ? (
              <p className="story-editor__placeholder">Carregando cenários…</p>
            ) : singleList ? (
              <div className="scenario-manager__columns">
                <div className="scenario-manager__col">
                  <h4 className="scenario-manager__col-title">Cenários</h4>
                  <div className="scenario-manager__list">
                    {allScenarios.length === 0 ? (
                      <p className="story-editor__placeholder">Nenhum cenário.</p>
                    ) : (
                      allScenarios.map((s) => {
                        const imgUrl = scenarioImageUrl(s);
                        return (
                          <div key={s.id} className="scenario-manager__polaroid-wrap">
                            <div className="polaroid-card polaroid-card--scenario">
                              <div className="polaroid-card__img-wrap">
                                {imgUrl ? (
                                  <img src={imgUrl} alt="" className="polaroid-card__img" />
                                ) : (
                                  <span className="polaroid-card__placeholder">Sem imagem</span>
                                )}
                              </div>
                              <span className="polaroid-card__name">{s.name || "(sem nome)"}</span>
                            </div>
                            <div className="scenario-manager__polaroid-actions">
                              <button
                                type="button"
                                className="ui-btn scenario-manager__btn-icon"
                                onClick={() => startEdit(s)}
                                title="Editar cenário"
                                aria-label="Editar cenário"
                              >
                                <EditPencilIcon />
                              </button>
                              <button
                                type="button"
                                className="ui-btn scenario-manager__btn-icon"
                                onClick={() => handleDelete(s.id)}
                                disabled={deletingId === s.id}
                                title="Excluir cenário"
                                aria-label="Excluir cenário"
                              >
                                {deletingId === s.id ? "Excluindo…" : "✕"}
                              </button>
                              <div
                                className="scenario-manager__polaroid-info-wrap"
                                onMouseEnter={(e) => {
                                  if (tooltipLeaveRef.current) { clearTimeout(tooltipLeaveRef.current); tooltipLeaveRef.current = null; }
                                  const r = e.currentTarget.getBoundingClientRect();
                                  const { x, y } = placeBeside(r);
                                  setTooltip({ scenario: s, x, y });
                                }}
                                onMouseLeave={() => { tooltipLeaveRef.current = setTimeout(() => setTooltip(null), 200); }}
                              >
                                <span className="scenario-manager__polaroid-info-trigger" aria-label="Ver detalhes">?</span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="scenario-manager__columns">
                <div className="scenario-manager__col">
                  <h4 className="scenario-manager__col-title">Fora da história</h4>
                  <div className="scenario-manager__list">
                    {notInStory.length === 0 ? (
                      <p className="story-editor__placeholder">Nenhum cenário disponível.</p>
                    ) : (
                      notInStory.map((s) => {
                        const imgUrl = scenarioImageUrl(s);
                        return (
                          <div key={s.id} className="scenario-manager__polaroid-wrap">
                            <div className="polaroid-card polaroid-card--scenario">
                              <div className="polaroid-card__img-wrap">
                                {imgUrl ? (
                                  <img src={imgUrl} alt="" className="polaroid-card__img" />
                                ) : (
                                  <span className="polaroid-card__placeholder">Sem imagem</span>
                                )}
                              </div>
                              <span className="polaroid-card__name">{s.name || "(sem nome)"}</span>
                            </div>
                            <div className="scenario-manager__polaroid-actions">
                              {isStoryEditor && onAddScenarioToStory && (
                                <button
                                  type="button"
                                  className="ui-btn scenario-manager__btn-icon"
                                  onClick={() => onAddScenarioToStory(s.id)}
                                  title="Adicionar à história"
                                  aria-label="Adicionar à história"
                                >
                                  +
                                </button>
                              )}
                              <button
                                type="button"
                                className="ui-btn scenario-manager__btn-icon"
                                onClick={() => startEdit(s)}
                                title="Editar cenário"
                                aria-label="Editar cenário"
                              >
                                <EditPencilIcon />
                              </button>
                              {!isStoryEditor && (
                                <button
                                  type="button"
                                  className="ui-btn scenario-manager__btn-icon"
                                  onClick={() => handleDelete(s.id)}
                                  disabled={deletingId === s.id}
                                  title="Excluir cenário"
                                  aria-label="Excluir cenário"
                                >
                                  ✕
                                </button>
                              )}
                              <div
                                className="scenario-manager__polaroid-info-wrap"
                                onMouseEnter={(e) => {
                                  if (tooltipLeaveRef.current) { clearTimeout(tooltipLeaveRef.current); tooltipLeaveRef.current = null; }
                                  const r = e.currentTarget.getBoundingClientRect();
                                  const { x, y } = placeBeside(r);
                                  setTooltip({ scenario: s, x, y });
                                }}
                                onMouseLeave={() => { tooltipLeaveRef.current = setTimeout(() => setTooltip(null), 200); }}
                              >
                                <span className="scenario-manager__polaroid-info-trigger" aria-label="Ver detalhes">?</span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
                <div className="scenario-manager__col">
                  <h4 className="scenario-manager__col-title">Na história</h4>
                  <div className="scenario-manager__list">
                    {inStory.length === 0 ? (
                      <p className="story-editor__placeholder">Nenhum. Cenários usados em cenas aparecem aqui.</p>
                    ) : (
                      inStory.map((s) => {
                        const imgUrl = scenarioImageUrl(s);
                        return (
                          <div key={s.id} className="scenario-manager__polaroid-wrap">
                            <div className="polaroid-card polaroid-card--scenario scenario-manager__in-story">
                              <div className="polaroid-card__img-wrap">
                                {imgUrl ? (
                                  <img src={imgUrl} alt="" className="polaroid-card__img" />
                                ) : (
                                  <span className="polaroid-card__placeholder">Sem imagem</span>
                                )}
                              </div>
                              <span className="polaroid-card__name">{s.name || "(sem nome)"}</span>
                            </div>
                            <div className="scenario-manager__polaroid-actions">
                              {isStoryEditor && onRemoveScenarioFromStory && (
                                <button
                                  type="button"
                                  className="ui-btn scenario-manager__btn-icon"
                                  onClick={() => handleRemoveFromStory(s.id)}
                                  disabled={removingId === s.id}
                                  title="Remover da história"
                                  aria-label="Remover da história"
                                >
                                  ↶
                                </button>
                              )}
                              <button
                                type="button"
                                className="ui-btn scenario-manager__btn-icon"
                                onClick={() => startEdit(s)}
                                title="Editar cenário"
                                aria-label="Editar cenário"
                              >
                                <EditPencilIcon />
                              </button>
                              {!isStoryEditor && (
                                <button
                                  type="button"
                                  className="ui-btn scenario-manager__btn-icon"
                                  onClick={() => handleDelete(s.id)}
                                  disabled={deletingId === s.id}
                                  title="Excluir cenário"
                                  aria-label="Excluir cenário"
                                >
                                  ✕
                                </button>
                              )}
                              <div
                                className="scenario-manager__polaroid-info-wrap"
                                onMouseEnter={(e) => {
                                  if (tooltipLeaveRef.current) { clearTimeout(tooltipLeaveRef.current); tooltipLeaveRef.current = null; }
                                  const r = e.currentTarget.getBoundingClientRect();
                                  const { x, y } = placeBeside(r);
                                  setTooltip({ scenario: s, x, y });
                                }}
                                onMouseLeave={() => { tooltipLeaveRef.current = setTimeout(() => setTooltip(null), 200); }}
                              >
                                <span className="scenario-manager__polaroid-info-trigger" aria-label="Ver detalhes">?</span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {tooltip &&
              createPortal(
                <div
                  className="scenario-manager__polaroid-tooltip scenario-manager__polaroid-tooltip--portal"
                  style={{ position: "fixed", left: tooltip.x, top: tooltip.y, zIndex: 100002 }}
                  onMouseEnter={() => { if (tooltipLeaveRef.current) { clearTimeout(tooltipLeaveRef.current); tooltipLeaveRef.current = null; } }}
                  onMouseLeave={() => setTooltip(null)}
                >
                  <ScenarioTooltipContent scenario={tooltip.scenario} className="scenario-manager__polaroid-tooltip__body" />
                </div>,
                document.body
              )}

            {!loading && scenarios.length === 0 && (
              <p className="story-editor__placeholder">Nenhum cenário. Use &quot;Novo cenário&quot; abaixo para criar.</p>
            )}
            </div>

            <div className="ui-actions ui-modal__actions" style={{ marginTop: 20 }}>
              {onRequestCreateScenario ? (
                <>
                  <button
                    type="button"
                    className="ui-btn"
                    onClick={() => { onClose(); onRequestCreateScenario(); }}
                  >
                    Novo cenário
                  </button>
                  <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose}>
                    Fechar
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="ui-btn" onClick={startCreate}>
                    Novo cenário
                  </button>
                  <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose}>
                    Fechar
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
