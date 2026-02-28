/** Proporção do cenário no palco (16:9), definida em um único lugar. */
export const CROP_ASPECT = 16 / 9;

/** Recorte da imagem do cenário em coordenadas 0–1 (x, y = canto superior esquerdo; width, height = tamanho). */
export type CropRect = { x: number; y: number; width: number; height: number };

/** Objeto mínimo de cenário para exibição (API ou estado local). */
export type ScenarioForDisplay = {
  image_storage_key: string | null;
  crop_x?: number | null;
  crop_y?: number | null;
  crop_width?: number | null;
  crop_height?: number | null;
};

/** URL da imagem do cenário (mesmo em todos os contextos: tela Cenários, preview, espetáculo). */
export function scenarioImageUrl(s: ScenarioForDisplay | null): string | null {
  if (!s?.image_storage_key) return null;
  return `/uploads/${s.image_storage_key}`;
}

/** Crop do cenário em 0–1, ou null se inválido (mesma lógica em todos os contextos). */
export function scenarioCropFromScenario(s: ScenarioForDisplay | null): CropRect | null {
  if (!s) return null;
  const x = Number(s.crop_x);
  const y = Number(s.crop_y);
  const w = Number(s.crop_width);
  const h = Number(s.crop_height);
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(w) ||
    !Number.isFinite(h) ||
    w <= 0 ||
    w > 1 ||
    h <= 0 ||
    h > 1
  )
    return null;
  return { x, y, width: w, height: h };
}

/** Retorna o maior retângulo 16:9 que cabe na imagem, centralizado (coords 0–1). */
export function defaultCropForImage(imgW: number, imgH: number): CropRect {
  const imgAspect = imgW / imgH;
  if (imgAspect >= CROP_ASPECT) {
    const width = (CROP_ASPECT * imgH) / imgW;
    return { x: (1 - width) / 2, y: 0, width, height: 1 };
  }
  const height = imgW / CROP_ASPECT / imgH;
  return { x: 0, y: (1 - height) / 2, width: 1, height };
}
