import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";

export type GMCharacter = {
  id: number;
  name: string;
  concept?: string;
  system?: string;
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

export function SceneCharactersModal({
  open,
  onClose,
  storyId,
  gmCharacters,
  storyCharacterIds,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  storyId: string;
  gmCharacters: GMCharacter[];
  storyCharacterIds: number[];
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [localIds, setLocalIds] = useState<number[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newConcept, setNewConcept] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) setLocalIds(storyCharacterIds);
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
      <div className="ui-modal__card ui-card scene-chars-modal">
        <h3 className="ui-modal__title">Personagens da história</h3>
        {err && <p className="scenario-manager__error">{err}</p>}
        <p className="story-editor__placeholder">
          Clique em um Figurino para adicionar ou remover da história.
        </p>

        <div className="scene-chars-modal__toolbar">
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            onClick={() => setFormOpen(true)}
          >
            Novo personagem
          </button>
        </div>

        {formOpen && (
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

        <div className="scene-chars-modal__columns">
          <div className="scene-chars-modal__col">
            <h4 className="scene-chars-modal__col-title">Figurinos (clique para adicionar à história)</h4>
            <div className="scene-chars-modal__list">
              {notInStory.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="scene-chars-modal__char scene-chars-modal__char--clickable"
                  onClick={() => toggleInStory(c.id)}
                  disabled={saving}
                >
                  <img
                    src={characterPortraitUrl(c)}
                    alt=""
                    className="scene-chars-modal__char-avatar"
                  />
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="scene-chars-modal__col">
            <h4 className="scene-chars-modal__col-title">Na história (clique para remover)</h4>
            <div className="scene-chars-modal__list">
              {inStory.length === 0 ? (
                <p className="story-editor__placeholder">Nenhum. Clique em um Figurino à esquerda.</p>
              ) : (
                inStory.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="scene-chars-modal__char scene-chars-modal__char--clickable scene-chars-modal__in-story"
                    onClick={() => toggleInStory(c.id)}
                    disabled={saving}
                  >
                    <img
                      src={characterPortraitUrl(c)}
                      alt=""
                      className="scene-chars-modal__char-avatar"
                    />
                    <span>{c.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

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
