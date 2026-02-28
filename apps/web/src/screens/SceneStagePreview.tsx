// Lógica compartilhada de preview da cena: mesmo grid 5 colunas e posicionamento do StageView.
// Usado no Roteiro (StoryEditor), no Espetáculo e deve refletir a tela principal quando o espetáculo inicia.
import { useMemo } from "react";
import "../styles/stage.css";

/** Recorte da imagem do cenário no palco (0–1). Se definido, só essa região é exibida. */
export type ScenarioCrop = { x: number; y: number; width: number; height: number };

export function ScenarioBackground({
  imageUrl,
  crop,
  className,
}: {
  imageUrl: string | null;
  crop?: ScenarioCrop | null;
  className: string;
}) {
  if (!imageUrl) {
    return <div className={className} style={{ backgroundColor: "#1a1a1a" }} />;
  }
  const validCrop =
    crop &&
    Number.isFinite(crop.x) &&
    Number.isFinite(crop.y) &&
    crop.width > 0 &&
    crop.width <= 1 &&
    crop.height > 0 &&
    crop.height <= 1;
  if (!validCrop) {
    return (
      <div
        className={className}
        style={{
          backgroundImage: `url(${imageUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundColor: "#1a1a1a",
        }}
      />
    );
  }
  const w = crop.width;
  const h = crop.height;
  const imgWidth = (100 / w).toFixed(2);
  const imgHeight = (100 / h).toFixed(2);
  const left = (-(crop.x / w) * 100).toFixed(2);
  const top = (-(crop.y / h) * 100).toFixed(2);
  return (
    <div
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#1a1a1a",
        width: "100%",
        height: "100%",
        minHeight: "100%",
      }}
    >
      <img
        src={imageUrl}
        alt=""
        aria-hidden
        style={{
          position: "absolute",
          width: `${imgWidth}%`,
          height: `${imgHeight}%`,
          left: `${left}%`,
          top: `${top}%`,
          objectFit: "cover",
          objectPosition: "center center",
        }}
      />
    </div>
  );
}

export type SceneStageActor = {
  id: number;
  name: string;
  side: "NPC" | "PC";
  imageUrl: string | null;
};

type GMCharacter = {
  id: number;
  name: string;
  owner_email?: string;
  default_image_url?: string | null;
  default_image_rev?: string | null;
};

function portraitUrl(c: GMCharacter): string | null {
  if (!c.default_image_url) return null;
  if (c.default_image_rev) return `${c.default_image_url}?rev=${c.default_image_rev}`;
  return c.default_image_url;
}

/** Mesma lógica de posicionamento do StageView: NPCs à esquerda (cols 1–2), PCs à direita (cols 4–5), col 3 vazia. */
function computePositions(count: number, side: "NPC" | "PC"): number[] {
  const base = side === "NPC" ? 20 : 80;
  const deltas =
    side === "NPC"
      ? [0, -6, +6, -12, +12, -18, +18, -24, +24]
      : [0, +6, -6, +12, -12, +18, -18, +24, -24];
  const min = side === "NPC" ? 8 : 68;
  const max = side === "NPC" ? 32 : 92;
  const xs: number[] = [];
  for (let i = 0; i < count; i++) {
    const d = deltas[i] ?? deltas[deltas.length - 1];
    const x = base + d;
    xs.push(i < deltas.length ? Math.max(min, Math.min(max, x)) : x);
  }
  return xs;
}

export function SceneStagePreview({
  scenarioImageUrl,
  scenarioCrop,
  sceneCharacterIds,
  gmCharacters,
  gmEmail,
  variant = "preview",
}: {
  scenarioImageUrl: string | null;
  /** Recorte no palco (0–1). Opcional. */
  scenarioCrop?: ScenarioCrop | null;
  sceneCharacterIds: number[];
  gmCharacters: GMCharacter[];
  gmEmail?: string;
  variant?: "preview" | "full";
}) {
  const { actors, posByActor } = useMemo(() => {
    const sceneChars = sceneCharacterIds
      .map((id) => gmCharacters.find((c) => c.id === id))
      .filter((c): c is GMCharacter => c != null);
    const npc: SceneStageActor[] = [];
    const pc: SceneStageActor[] = [];
    if (gmEmail) {
      sceneChars.forEach((c) => {
        const side = c.owner_email === gmEmail ? ("NPC" as const) : ("PC" as const);
        const a: SceneStageActor = {
          id: c.id,
          name: c.name,
          side,
          imageUrl: portraitUrl(c) ?? null,
        };
        if (side === "NPC") npc.push(a);
        else pc.push(a);
      });
    } else {
      const half = Math.ceil(sceneChars.length / 2);
      sceneChars.forEach((c, i) => {
        const side = i < half ? ("NPC" as const) : ("PC" as const);
        const a: SceneStageActor = {
          id: c.id,
          name: c.name,
          side,
          imageUrl: portraitUrl(c) ?? null,
        };
        if (side === "NPC") npc.push(a);
        else pc.push(a);
      });
    }
    const actors = [...npc, ...pc];
    const npcXs = computePositions(npc.length, "NPC");
    const pcXs = computePositions(pc.length, "PC");
    const posByActor: Record<number, number> = {};
    npc.forEach((a, i) => {
      posByActor[a.id] = npcXs[i] ?? 20;
    });
    pc.forEach((a, i) => {
      posByActor[a.id] = pcXs[i] ?? 80;
    });
    return { actors, posByActor };
  }, [sceneCharacterIds, gmCharacters, gmEmail]);

  const isPreview = variant === "preview";

  return (
    <div
      className={"scene-stage-preview" + (isPreview ? " scene-stage-preview--preview" : "")}
      role="img"
      aria-label="Preview do palco da cena"
    >
      <ScenarioBackground
        imageUrl={scenarioImageUrl}
        crop={scenarioCrop}
        className="stage-view__scenario"
      />
      <div className="stage-view__grid" aria-hidden="true">
        <div className="stage-view__col stage-view__col--1" />
        <div className="stage-view__col stage-view__col--2" />
        <div className="stage-view__col stage-view__col--3" />
        <div className="stage-view__col stage-view__col--4" />
        <div className="stage-view__col stage-view__col--5" />
      </div>
      <div className="stage-view__actors" aria-hidden="true">
        {actors.map((a) => {
          const x = posByActor[a.id] ?? (a.side === "NPC" ? 20 : 80);
          return (
            <div
              key={a.id}
              className={`stage-actor stage-actor--${a.side}`}
              style={{ left: `${x}%` }}
            >
              <img
                className="stage-actor__img"
                src={a.imageUrl || "/assets/jogador_default.png"}
                alt={a.name}
                draggable={false}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
