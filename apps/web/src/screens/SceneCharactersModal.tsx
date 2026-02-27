import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";

export type GMCharacter = {
  id: number;
  name: string;
  concept?: string;
  system?: string;
  backstory?: string;
  notes?: string;
  systems?: string[];
  owner_email?: string;
  default_image_url?: string | null;
  default_image_rev?: string | null;
};

function characterPortraitUrl(c: GMCharacter): string {
  const fallback = "/assets/jogador_default.png";
  if (!c.default_image_url) return fallback;
  if (c.default_image_rev) return `${c.default_image_url}?rev=${encodeURIComponent(c.default_image_rev)}`;
  return c.default_image_url;
}

function systemLabel(sys: string) {
  if (sys === "candela_obscura") return "Candela Obscura";
  if (sys === "simplificado") return "Simplificado";
  return sys || "—";
}

function systemsLabel(c: GMCharacter) {
  const list = (c.systems || (c.system ? [c.system] : [])).filter(Boolean);
  if (!list.length) return "—";
  return list.map(systemLabel).join(", ");
}

function EditPencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 5L5 18M5 18l3 3" />
      <line x1="3" y1="22" x2="15" y2="22" />
    </svg>
  );
}

function CharacterTooltipContent({ character, className }: { character: GMCharacter; className?: string }) {
  return (
    <div className={className ?? "scene-chars-modal__polaroid-tooltip"}>
      <div className="scene-chars-tooltip__row">
        <div className="scene-chars-tooltip__label">Nome</div>
        <div className="scene-chars-tooltip__value">{character.name || "—"}</div>
      </div>
      <div className="scene-chars-tooltip__row">
        <div className="scene-chars-tooltip__label">Conceito</div>
        <div className="scene-chars-tooltip__value">{character.concept || "—"}</div>
      </div>
      <div className="scene-chars-tooltip__row">
        <div className="scene-chars-tooltip__label">Backstory</div>
        <div className="scene-chars-tooltip__value">{character.backstory || "—"}</div>
      </div>
      <div className="scene-chars-tooltip__row">
        <div className="scene-chars-tooltip__label">Notas</div>
        <div className="scene-chars-tooltip__value">{character.notes || "—"}</div>
      </div>
      <div className="scene-chars-tooltip__row">
        <div className="scene-chars-tooltip__label">Sistemas</div>
        <div className="scene-chars-tooltip__value">{systemsLabel(character)}</div>
      </div>
    </div>
  );
}

export function SceneCharactersModal({
  open,
  onClose,
  storyId,
  gmCharacters,
  storyCharacterIds,
  onSaved,
  onEditCharacter,
  onRequestCreateCharacter,
}: {
  open: boolean;
  onClose: () => void;
  storyId: string;
  gmCharacters: GMCharacter[];
  storyCharacterIds: number[];
  onSaved: () => void;
  /** Ao clicar em Editar, o parent abre a edição no pop up (não sai do editor). */
  onEditCharacter?: (c: GMCharacter) => void;
  /** Se definido, "Novo personagem" fecha o modal e chama isto (tela de criação padrão). */
  onRequestCreateCharacter?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [localIds, setLocalIds] = useState<number[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newConcept, setNewConcept] = useState("");
  const [creating, setCreating] = useState(false);
  const [tooltip, setTooltip] = useState<{ character: GMCharacter; x: number; y: number } | null>(null);
  const tooltipLeaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(() => {
    if (open) setLocalIds(storyCharacterIds);
    else setTooltip(null);
  }, [open, storyCharacterIds]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (formOpen) setFormOpen(false);
        else onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, formOpen, onClose]);

  async function putStoryCharacters(ids: number[]) {
    setErr(null);
    setSaving(true);
    try {
      await api(`/api/gm/stories/${storyId}/characters`, {
        method: "PUT",
        body: JSON.stringify({ character_ids: ids }),
      });
      setLocalIds(ids);
      onSaved();
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

  function toggleInStory(charId: number) {
    if (localIds.includes(charId)) {
      putStoryCharacters(localIds.filter((id) => id !== charId));
    } else {
      putStoryCharacters([...localIds, charId]);
    }
  }

  async function handleCreateCharacter(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setErr(null);
    setCreating(true);
    try {
      const res = await api<{ character: GMCharacter }>("/api/gm/characters", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          concept: newConcept.trim(),
          backstory: "",
          notes: "",
        }),
      });
      const created = res?.character;
      if (created) {
        setNewName("");
        setNewConcept("");
        setFormOpen(false);
        putStoryCharacters([...localIds, created.id]);
      }
    } catch (e: unknown) {
      const msg =
        e && typeof (e as { message?: string })?.message === "string"
          ? (e as { message: string }).message
          : "Falha ao criar personagem";
      setErr(msg);
    } finally {
      setCreating(false);
    }
  }

  const inStory = localIds
    .map((id) => gmCharacters.find((c) => c.id === id))
    .filter(Boolean) as GMCharacter[];
  const notInStory = gmCharacters.filter((c) => !localIds.includes(c.id));

  if (!open) return null;

  const dialog = (
    <div className="ui-modal" role="dialog" aria-modal="true" aria-label="Personagens da história">
      <button className="ui-modal__backdrop" onClick={onClose} aria-label="Fechar" />
      <div className="ui-modal__card ui-card scene-chars-modal scene-chars-modal--polaroid">
        <h3 className="ui-modal__title">Gerenciar personagens</h3>
        {err && <p className="scenario-manager__error">{err}</p>}
        <p className="story-editor__placeholder" style={{ marginBottom: 8 }}>
          Clique na polaroide para adicionar ou remover da história. Botões: adicionar/remover e editar.
        </p>

        {formOpen && !onRequestCreateCharacter && (
          <form className="scene-chars-modal__form" onSubmit={handleCreateCharacter}>
            <p className="ui-label">Novo personagem</p>
            <input
              type="text"
              className="ui-field"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome"
              required
              autoFocus
            />
            <input
              type="text"
              className="ui-field"
              value={newConcept}
              onChange={(e) => setNewConcept(e.target.value)}
              placeholder="Conceito (opcional)"
              style={{ marginTop: 8 }}
            />
            <div className="ui-actions" style={{ marginTop: 12 }}>
              <button type="submit" className="ui-btn" disabled={creating}>
                {creating ? "Criando…" : "Criar"}
              </button>
              <button
                type="button"
                className="ui-btn ui-btn--ghost"
                onClick={() => { setFormOpen(false); setNewName(""); setNewConcept(""); }}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {(!formOpen || onRequestCreateCharacter) && (
          <>
            <div className="scene-chars-modal__scroll">
            <div className="scene-chars-modal__columns">
              <div className="scene-chars-modal__col">
                <h4 className="scene-chars-modal__col-title">Fora da história (clique para adicionar)</h4>
                <div className="scene-chars-modal__list">
                  {notInStory.length === 0 ? (
                    <p className="story-editor__placeholder">Nenhum figurino disponível.</p>
                  ) : (
                    notInStory.map((c) => (
                      <div key={c.id} className="scene-chars-modal__polaroid-wrap">
                        <button
                          type="button"
                          className="polaroid-card polaroid-card--character scene-chars-modal__polaroid-btn"
                          onClick={() => toggleInStory(c.id)}
                          disabled={saving}
                        >
                          <div className="polaroid-card__img-wrap">
                            <img
                              src={characterPortraitUrl(c)}
                              alt=""
                              className="polaroid-card__img"
                            />
                          </div>
                          <span className="polaroid-card__name">{c.name}</span>
                        </button>
                        <div className="scene-chars-modal__polaroid-actions">
                          <button
                            type="button"
                            className="ui-btn scene-chars-modal__btn-icon"
                            onClick={(e) => { e.stopPropagation(); toggleInStory(c.id); }}
                            disabled={saving}
                            title="Adicionar à história"
                            aria-label="Adicionar à história"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="ui-btn scene-chars-modal__btn-icon"
                            onClick={(e) => { e.stopPropagation(); onEditCharacter?.(c); }}
                            title="Editar personagem"
                            aria-label="Editar personagem"
                          >
                            <EditPencilIcon />
                          </button>
                          <div
                            className="scene-chars-modal__polaroid-info-wrap"
                            onMouseEnter={(e) => {
                              if (tooltipLeaveRef.current) { clearTimeout(tooltipLeaveRef.current); tooltipLeaveRef.current = null; }
                              const r = e.currentTarget.getBoundingClientRect();
                              const { x, y } = placeBeside(r);
                              setTooltip({ character: c, x, y });
                            }}
                            onMouseLeave={() => { tooltipLeaveRef.current = setTimeout(() => setTooltip(null), 200); }}
                          >
                            <span className="scene-chars-modal__polaroid-info-trigger" aria-label="Ver ficha">?</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="scene-chars-modal__col">
                <h4 className="scene-chars-modal__col-title">Na história (clique para remover)</h4>
                <div className="scene-chars-modal__list">
                  {inStory.length === 0 ? (
                    <p className="story-editor__placeholder">Nenhum. Clique em um à esquerda para adicionar.</p>
                  ) : (
                    inStory.map((c) => (
                      <div key={c.id} className="scene-chars-modal__polaroid-wrap">
                        <button
                          type="button"
                          className="polaroid-card polaroid-card--character scene-chars-modal__polaroid-btn scene-chars-modal__in-story"
                          onClick={() => toggleInStory(c.id)}
                          disabled={saving}
                        >
                          <div className="polaroid-card__img-wrap">
                            <img
                              src={characterPortraitUrl(c)}
                              alt=""
                              className="polaroid-card__img"
                            />
                          </div>
                          <span className="polaroid-card__name">{c.name}</span>
                        </button>
                        <div className="scene-chars-modal__polaroid-actions">
                          <button
                            type="button"
                            className="ui-btn scene-chars-modal__btn-icon"
                            onClick={(e) => { e.stopPropagation(); toggleInStory(c.id); }}
                            disabled={saving}
                            title="Remover da história"
                            aria-label="Remover da história"
                          >
                            ✕
                          </button>
                          <button
                            type="button"
                            className="ui-btn scene-chars-modal__btn-icon"
                            onClick={(e) => { e.stopPropagation(); onEditCharacter?.(c); }}
                            title="Editar personagem"
                            aria-label="Editar personagem"
                          >
                            <EditPencilIcon />
                          </button>
                          <div
                            className="scene-chars-modal__polaroid-info-wrap"
                            onMouseEnter={(e) => {
                              if (tooltipLeaveRef.current) { clearTimeout(tooltipLeaveRef.current); tooltipLeaveRef.current = null; }
                              const r = e.currentTarget.getBoundingClientRect();
                              const { x, y } = placeBeside(r);
                              setTooltip({ character: c, x, y });
                            }}
                            onMouseLeave={() => { tooltipLeaveRef.current = setTimeout(() => setTooltip(null), 200); }}
                          >
                            <span className="scene-chars-modal__polaroid-info-trigger" aria-label="Ver ficha">?</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            </div>

            {tooltip &&
              createPortal(
                <div
                  className="scene-chars-modal__polaroid-tooltip scene-chars-modal__polaroid-tooltip--portal"
                  style={{ position: "fixed", left: tooltip.x, top: tooltip.y, zIndex: 100002 }}
                  onMouseEnter={() => { if (tooltipLeaveRef.current) { clearTimeout(tooltipLeaveRef.current); tooltipLeaveRef.current = null; } }}
                  onMouseLeave={() => setTooltip(null)}
                >
                  <CharacterTooltipContent character={tooltip.character} className="scene-chars-modal__polaroid-tooltip__body" />
                </div>,
                document.body
              )}

            <div className="ui-actions ui-modal__actions" style={{ marginTop: 20 }}>
              {onRequestCreateCharacter ? (
                <>
                  <button
                    type="button"
                    className="ui-btn"
                    onClick={() => { onClose(); onRequestCreateCharacter(); }}
                  >
                    Novo personagem
                  </button>
                  <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose}>
                    Fechar
                  </button>
                </>
              ) : (
                <>
                  {!formOpen && (
                    <button
                      type="button"
                      className="ui-btn"
                      onClick={() => setFormOpen(true)}
                    >
                      Novo personagem
                    </button>
                  )}
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
