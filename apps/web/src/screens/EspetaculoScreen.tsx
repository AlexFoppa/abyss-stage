import { useEffect, useState } from "react";
import { api } from "../api";
import { scenarioCropFromScenario, scenarioImageUrl as getScenarioImageUrl } from "../scenarioCrop";
import { useAuth } from "../auth/AuthProvider";
import { SceneStagePreview } from "./SceneStagePreview";
import "../styles/screens/selectCharacter.css";
import "../styles/screens/story-editor.css";

type Story = { id: string; name: string };
type Scene = {
  id: string;
  story_id: string;
  title: string;
  body: string;
  order_index: number;
  is_narrative: boolean;
  scenario_id: string | null;
};

type GMCharacter = {
  id: number;
  name: string;
  owner_email?: string;
  default_image_url?: string | null;
  default_image_rev?: string | null;
};

type ScenarioOut = {
  id: string;
  image_storage_key: string | null;
  crop_x?: number | null;
  crop_y?: number | null;
  crop_width?: number | null;
  crop_height?: number | null;
};
type SceneCharactersOut = { character_ids: number[] };

function characterPortraitUrl(c: GMCharacter): string {
  if (!c.default_image_url) return "/assets/jogador_default.png";
  if (c.default_image_rev) return `${c.default_image_url}?rev=${encodeURIComponent(c.default_image_rev)}`;
  return c.default_image_url;
}

export function EspetaculoScreen({
  onBack,
  onStartShow,
  onEditScene,
}: {
  onBack: () => void;
  onStartShow: (storyId: string, sceneId: string, scenarioId: string | null) => void;
  onEditScene?: (storyId: string, sceneId: string) => void;
}) {
  const { user } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr(null);
      setLoading(true);
      try {
        const list = await api<Story[]>("/api/gm/stories");
        if (cancelled) return;
        setStories(Array.isArray(list) ? list : []);
        setSelectedStoryId(null);
        setSelectedSceneId(null);
        setScenes([]);
      } catch (e: unknown) {
        if (cancelled) return;
        const msg =
          e && typeof (e as { message?: string }).message === "string"
            ? (e as { message: string }).message
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

  useEffect(() => {
    if (!selectedStoryId) {
      setScenes([]);
      setSelectedSceneId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await api<Scene[]>(`/api/gm/stories/${selectedStoryId}/scenes`);
        if (cancelled) return;
        setScenes(Array.isArray(list) ? list : []);
        setSelectedSceneId(null);
      } catch {
        if (!cancelled) setScenes([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedStoryId]);

  const activeScene = scenes.find((s) => s.id === selectedSceneId) ?? null;
  const canOpenCurtains = Boolean(selectedStoryId && selectedSceneId);

  const [scenarioImageUrl, setScenarioImageUrl] = useState<string | null>(null);
  const [scenarioCrop, setScenarioCrop] = useState<ReturnType<typeof scenarioCropFromScenario>>(null);
  const [sceneCharacterIds, setSceneCharacterIds] = useState<number[]>([]);
  const [gmCharacters, setGmCharacters] = useState<GMCharacter[]>([]);

  useEffect(() => {
    if (!selectedStoryId) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await api<GMCharacter[]>("/api/gm/characters");
        if (!cancelled) setGmCharacters(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setGmCharacters([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedStoryId]);

  useEffect(() => {
    if (!activeScene) {
      setScenarioImageUrl(null);
      setSceneCharacterIds([]);
      return;
    }
    if (activeScene.scenario_id) {
      setScenarioImageUrl(null);
      setScenarioCrop(null);
      let cancelled = false;
      const sid = activeScene.scenario_id;
      (async () => {
        try {
          const s = await api<ScenarioOut>(`/api/gm/scenarios/${sid}`);
          if (cancelled) return;
          setScenarioImageUrl(getScenarioImageUrl(s));
          setScenarioCrop(scenarioCropFromScenario(s));
        } catch {
          if (!cancelled) {
            setScenarioImageUrl(null);
            setScenarioCrop(null);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    } else {
      setScenarioImageUrl(null);
      setScenarioCrop(null);
    }
  }, [activeScene?.id, activeScene?.scenario_id]);

  useEffect(() => {
    if (!selectedStoryId || !activeScene) {
      setSceneCharacterIds([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api<SceneCharactersOut>(
          `/api/gm/stories/${selectedStoryId}/scenes/${activeScene.id}/characters`
        );
        if (!cancelled) setSceneCharacterIds(Array.isArray(res?.character_ids) ? res.character_ids : []);
      } catch {
        if (!cancelled) setSceneCharacterIds([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedStoryId, activeScene?.id]);

  return (
    <div className="select-scene espetaculo-screen">
      <div className="select-grid">
        <section className="ui-card select-col select-col--list">
          <div className="select-head">
            <h2 className="select-title">Espetáculo</h2>
          </div>
          <p className="select-muted espetaculo-screen__intro">
            Selecione uma história e uma cena. Depois, abra as cortinas para iniciar o jogo.
          </p>

          {loading ? (
            <div className="select-muted">Carregando…</div>
          ) : err ? (
            <div className="select-error">{err}</div>
          ) : (
            <>
              <div className="espetaculo-story-row">
                <label className="book-label" htmlFor="espetaculo-story">
                  História
                </label>
                <select
                  id="espetaculo-story"
                  className="ui-field"
                  value={selectedStoryId ?? ""}
                  onChange={(e) => setSelectedStoryId(e.target.value || null)}
                  aria-label="Selecione uma história"
                >
                  <option value="">— Selecione —</option>
                  {stories.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedStoryId && (
                <>
                  <div className="select-list-head book-label">Cenas</div>
                  {scenes.length === 0 ? (
                    <div className="select-muted">Nenhuma cena nesta história.</div>
                  ) : (
                    <div className="select-list">
                      {scenes.map((s) => {
                        const isActive = s.id === selectedSceneId;
                        return (
                          <button
                            key={s.id}
                            className={`select-item ${isActive ? "is-active" : ""}`}
                            onClick={() => setSelectedSceneId(s.id)}
                            type="button"
                          >
                            <div className="select-item-name">
                              {s.title || "(sem título)"}
                            </div>
                            <div className="select-item-sub">
                              {s.is_narrative ? "Narrativa" : "Cena"}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              <div className="select-footer">
                <button type="button" className="ui-btn ui-btn--ghost" onClick={onBack}>
                  Voltar
                </button>
              </div>
            </>
          )}
        </section>

        <section className="ui-card select-col select-col--book">
          <h2 className="select-title">Roteiro</h2>

          {!selectedStoryId ? (
            <div className="select-muted">Selecione uma história.</div>
          ) : !activeScene ? (
            <div className="select-muted">Selecione uma cena para ver o roteiro.</div>
          ) : (
            <div className="book">
              <div className="book-page">
                <div className="book-content">
                  <div className="book-row">
                    <div className="book-label">Título da cena</div>
                    <div className="book-value">{activeScene.title || "—"}</div>
                  </div>
                  <div className="book-row">
                    <div className="book-label">Tipo da cena</div>
                    <div className="book-value">
                      {activeScene.is_narrative ? "Narrativa" : "Normal (cenário + personagens)"}
                    </div>
                  </div>

                  <div className="espetaculo-preview-wrap">
                    {activeScene.is_narrative ? (
                      <div className="story-editor__preview">
                        <h3 className="story-editor__preview-title">Preview</h3>
                        <div className="story-editor__preview-stage story-editor__preview-stage--narrative">
                          <p className="story-editor__placeholder">Cena narrativa — sem preview.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="story-editor__preview">
                        <h3 className="story-editor__preview-title">Preview da cena</h3>
                        <SceneStagePreview
                          scenarioImageUrl={scenarioImageUrl}
                          scenarioCrop={scenarioCrop}
                          sceneCharacterIds={sceneCharacterIds}
                          gmCharacters={gmCharacters}
                          gmEmail={user?.email ?? undefined}
                          variant="preview"
                        />
                      </div>
                    )}
                  </div>

                  <div className="book-row">
                    <div className="book-label">Personagens nesta cena</div>
                    <div className="book-value">
                      {sceneCharacterIds.length === 0 ? (
                        "—"
                      ) : (
                        <ul className="espetaculo-char-list">
                          {sceneCharacterIds
                            .map((id) => gmCharacters.find((c) => c.id === id))
                            .filter((c): c is GMCharacter => c != null)
                            .map((c) => (
                              <li key={c.id}>{c.name}</li>
                            ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="book-row">
                    <div className="book-label">Descrição / corpo</div>
                    <div className="book-value book-multiline">
                      {activeScene.body || "—"}
                    </div>
                  </div>
                </div>

                <div className="select-actions espetaculo-scene-actions">
                  <button
                    type="button"
                    className="ui-btn"
                    disabled={!canOpenCurtains}
                    onClick={() => {
                      if (!canOpenCurtains || !selectedStoryId || !selectedSceneId) return;
                      const scene = scenes.find((s) => s.id === selectedSceneId);
                      onStartShow(
                        selectedStoryId,
                        selectedSceneId,
                        scene?.scenario_id ?? null
                      );
                    }}
                  >
                    Abrir as cortinas
                  </button>
                  {onEditScene && selectedStoryId && selectedSceneId && (
                    <button
                      type="button"
                      className="ui-btn ui-btn--ghost"
                      onClick={() =>
                        onEditScene(selectedStoryId, selectedSceneId)
                      }
                    >
                      Editar
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
