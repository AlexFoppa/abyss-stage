import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

export type StoryInfo = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type Scene = {
  id: string;
  story_id: string;
  title: string;
  body: string;
  order_index: number;
  is_narrative: boolean;
  scenario_id: string | null;
  created_at: string;
  updated_at: string;
};

export function StoryEditorScreen({
  storyId,
  onBack,
}: {
  storyId: string;
  onBack: () => void;
}) {
  const [story, setStory] = useState<StoryInfo | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const activeScene = scenes.find((s) => s.id === activeSceneId) ?? null;

  const loadStory = useCallback(async () => {
    try {
      const s = await api<StoryInfo>(`/api/gm/stories/${storyId}`);
      setStory(s);
    } catch (e: unknown) {
      const msg =
        e && typeof (e as { message?: string })?.message === "string"
          ? (e as { message: string }).message
          : "Falha ao carregar história";
      setErr(msg);
    }
  }, [storyId]);

  const loadScenes = useCallback(async () => {
    try {
      const list = await api<Scene[]>(`/api/gm/stories/${storyId}/scenes`);
      const ordered = Array.isArray(list) ? [...list].sort((a, b) => a.order_index - b.order_index) : [];
      setScenes(ordered);
      if (ordered.length > 0) {
        setActiveSceneId((prev) => (ordered.some((s) => s.id === prev) ? prev : ordered[0].id));
      } else {
        setActiveSceneId(null);
      }
    } catch (e: unknown) {
      const msg =
        e && typeof (e as { message?: string })?.message === "string"
          ? (e as { message: string }).message
          : "Falha ao carregar cenas";
      setErr(msg);
    }
  }, [storyId]);

  useEffect(() => {
    let cancelled = false;
    setErr(null);
    setLoading(true);
    (async () => {
      await loadStory();
      if (cancelled) return;
      await loadScenes();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [storyId, loadStory, loadScenes]);

  async function handleCreateScene() {
    const title = window.prompt("Título da nova cena:", "Nova cena");
    if (title == null || !title.trim()) return;
    setErr(null);
    setCreating(true);
    try {
      const created = await api<Scene>(`/api/gm/stories/${storyId}/scenes`, {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          body: "",
          order_index: scenes.length,
          is_narrative: false,
          scenario_id: null,
        }),
      });
      setScenes((prev) => [...prev, created].sort((a, b) => a.order_index - b.order_index));
      setActiveSceneId(created.id);
    } catch (e: unknown) {
      const msg =
        e && typeof (e as { message?: string })?.message === "string"
          ? (e as { message: string }).message
          : "Falha ao criar cena";
      setErr(msg);
    } finally {
      setCreating(false);
    }
  }

  if (loading && !story) {
    return (
      <div className="story-editor">
        <div className="story-editor__header">
          <button type="button" className="ui-btn ui-btn--ghost" onClick={onBack}>
            Voltar
          </button>
          <span className="story-editor__title">Carregando…</span>
        </div>
        <div className="story-editor__grid" />
      </div>
    );
  }

  if (err && !story) {
    return (
      <div className="story-editor">
        <div className="story-editor__header">
          <button type="button" className="ui-btn ui-btn--ghost" onClick={onBack}>
            Voltar
          </button>
          <span className="story-editor__title">Erro</span>
        </div>
        <p className="story-editor__error">{err}</p>
      </div>
    );
  }

  return (
    <div className="story-editor">
      <div className="story-editor__header">
        <button type="button" className="ui-btn ui-btn--ghost" onClick={onBack}>
          Voltar
        </button>
        <h1 className="story-editor__title">{story?.name ?? storyId}</h1>
      </div>

      <div className="story-editor__grid">
        <section className="story-editor__scenarios" aria-label="Cenários">
          <p className="story-editor__placeholder">Cenários (em breve)</p>
        </section>

        <aside className="story-editor__scenes" aria-label="Cenas">
          <div className="story-editor__scenes-toolbar">
            <button
              type="button"
              className="ui-btn ui-btn--primary"
              disabled={creating}
              onClick={handleCreateScene}
            >
              {creating ? "Criando…" : "Nova cena"}
            </button>
          </div>
          <ul className="story-editor__scene-list">
            {scenes.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={"story-editor__scene-item " + (s.id === activeSceneId ? "story-editor__scene-item--active" : "")}
                  onClick={() => setActiveSceneId(s.id)}
                >
                  {s.title || "(sem título)"}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="story-editor__main" aria-label="Cena ativa">
          {activeScene ? (
            <div className="story-editor__scene-content">
              <h2 className="story-editor__scene-content-title">{activeScene.title}</h2>
              <pre className="story-editor__scene-body">{activeScene.body || "(vazio)"}</pre>
            </div>
          ) : (
            <p className="story-editor__placeholder">
              {scenes.length === 0 ? "Crie uma cena para começar." : "Selecione uma cena."}
            </p>
          )}
        </main>

        <aside className="story-editor__characters" aria-label="Personagens">
          <p className="story-editor__placeholder">Personagens (em breve)</p>
        </aside>
      </div>
    </div>
  );
}
