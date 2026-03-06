import { useCallback, useEffect, useRef, useState } from "react";
import { CROP_ASPECT, defaultCropForImage, type CropRect } from "../scenarioCrop";

type Corner = "nw" | "ne" | "sw" | "se";

/** Mantém proporção 16:9 e garante que o retângulo fique inteiro em [0,1]x[0,1]. */
function clampCrop(c: CropRect): CropRect {
  let x = Math.max(0, Math.min(1, c.x));
  let y = Math.max(0, Math.min(1, c.y));
  let w = Math.max(0.02, Math.min(1, c.width));
  let h = w / CROP_ASPECT;
  if (x + w > 1) w = Math.max(0.02, 1 - x);
  if (y + h > 1) {
    h = Math.max(0.02, 1 - y);
    w = h * CROP_ASPECT;
    if (x + w > 1) w = Math.max(0.02, 1 - x);
    h = w / CROP_ASPECT;
  }
  x = Math.max(0, Math.min(1 - w, x));
  y = Math.max(0, Math.min(1 - h, y));
  return { x, y, width: w, height: h };
}

/** fixed = canto oposto ao que está sendo arrastado. movingTo = posição do mouse em 0-1. */
function resizeFromCorner(
  corner: Corner,
  fixed: { x: number; y: number },
  movingTo: { x: number; y: number }
): CropRect {
  let x: number;
  let y: number;
  let w: number;
  let h: number;
  const minSize = 0.02;
  switch (corner) {
    case "se":
      w = Math.max(minSize, movingTo.x - fixed.x);
      h = w / CROP_ASPECT;
      if (fixed.y + h > 1) {
        h = 1 - fixed.y;
        w = h * CROP_ASPECT;
      }
      x = fixed.x;
      y = fixed.y;
      break;
    case "sw":
      w = Math.max(minSize, fixed.x - movingTo.x);
      h = w / CROP_ASPECT;
      if (fixed.y + h > 1) {
        h = 1 - fixed.y;
        w = h * CROP_ASPECT;
      }
      x = fixed.x - w;
      y = fixed.y;
      break;
    case "ne":
      w = Math.max(minSize, movingTo.x - fixed.x);
      h = w / CROP_ASPECT;
      if (fixed.y - h < 0) {
        h = fixed.y;
        w = h * CROP_ASPECT;
      }
      x = fixed.x;
      y = fixed.y - h;
      break;
    case "nw":
      w = Math.max(minSize, fixed.x - movingTo.x);
      h = w / CROP_ASPECT;
      if (fixed.y - h < 0) {
        h = fixed.y;
        w = h * CROP_ASPECT;
      }
      x = fixed.x - w;
      y = fixed.y - h;
      break;
  }
  const out: CropRect = { x, y, width: w, height: h };
  out.x = Math.max(0, Math.min(1 - out.width, out.x));
  out.y = Math.max(0, Math.min(1 - out.height, out.y));
  return out;
}

export function ScenarioCropEditor({
  imageUrl,
  crop,
  onChange,
  showHint = true,
}: {
  imageUrl: string;
  crop: CropRect | null;
  onChange: (crop: CropRect) => void;
  showHint?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [effectiveCrop, setEffectiveCrop] = useState(crop);
  const dragRef = useRef<{ startX: number; startY: number; cropX: number; cropY: number } | null>(null);
  const resizeRef = useRef<{
    corner: Corner;
    /** Canto oposto ao que está sendo arrastado (fixo durante o resize). */
    fixed: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    setEffectiveCrop(crop);
  }, [crop]);

  const onImageLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setImageSize({ w, h });
    if (!crop) {
      const next = defaultCropForImage(w, h);
      setEffectiveCrop(next);
      onChange(next);
    }
  }, [crop, onChange]);

  const toNorm = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return { nx: 0, ny: 0 };
    const rect = container.getBoundingClientRect();
    return {
      nx: (clientX - rect.left) / rect.width,
      ny: (clientY - rect.top) / rect.height,
    };
  }, []);

  const handleRectMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (!effectiveCrop) return;
      if ((e.target as HTMLElement).closest(".scenario-crop-editor__handle")) return;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        cropX: effectiveCrop.x,
        cropY: effectiveCrop.y,
      };
    },
    [effectiveCrop]
  );

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent, corner: Corner) => {
      e.preventDefault();
      e.stopPropagation();
      if (!effectiveCrop) return;
      let fixed: { x: number; y: number };
      const c = effectiveCrop;
      switch (corner) {
        case "se":
          fixed = { x: c.x, y: c.y };
          break;
        case "sw":
          fixed = { x: c.x + c.width, y: c.y };
          break;
        case "ne":
          fixed = { x: c.x, y: c.y + c.height };
          break;
        case "nw":
          fixed = { x: c.x + c.width, y: c.y + c.height };
          break;
      }
      resizeRef.current = { corner, fixed };
    },
    [effectiveCrop]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const scaleX = 1 / rect.width;
      const scaleY = 1 / rect.height;

      const d = dragRef.current;
      if (d) {
        const dx = (e.clientX - d.startX) * scaleX;
        const dy = (e.clientY - d.startY) * scaleY;
        setEffectiveCrop((prev) => {
          if (!prev) return prev;
          let x = d.cropX + dx;
          let y = d.cropY + dy;
          x = Math.max(0, Math.min(1 - prev.width, x));
          y = Math.max(0, Math.min(1 - prev.height, y));
          const next = { ...prev, x, y };
          onChange(next);
          dragRef.current = { startX: e.clientX, startY: e.clientY, cropX: x, cropY: y };
          return next;
        });
        return;
      }

      const r = resizeRef.current;
      if (r) {
        const { nx, ny } = toNorm(e.clientX, e.clientY);
        const clampedPoint = {
          x: Math.max(0, Math.min(1, nx)),
          y: Math.max(0, Math.min(1, ny)),
        };
        const next = clampCrop(resizeFromCorner(r.corner, r.fixed, clampedPoint));
        setEffectiveCrop(next);
        onChange(next);
      }
    };
    const onUp = () => {
      dragRef.current = null;
      resizeRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onChange, toNorm]);

  if (!imageUrl) return null;
  return (
    <div className="scenario-crop-editor">
      <div
        ref={containerRef}
        className="scenario-crop-editor__wrap"
        style={imageSize ? { aspectRatio: `${imageSize.w} / ${imageSize.h}` } : undefined}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt=""
          className="scenario-crop-editor__img"
          onLoad={onImageLoad}
        />
        {effectiveCrop && (
          <div
            className="scenario-crop-editor__rect"
            style={{
              left: `${effectiveCrop.x * 100}%`,
              top: `${effectiveCrop.y * 100}%`,
              width: `${effectiveCrop.width * 100}%`,
              height: `${effectiveCrop.height * 100}%`,
            }}
            onMouseDown={handleRectMouseDown}
            role="presentation"
            aria-hidden
          >
            <span className="scenario-crop-editor__handle scenario-crop-editor__handle--nw" onMouseDown={(e) => handleResizeMouseDown(e, "nw")} title="Redimensionar" />
            <span className="scenario-crop-editor__handle scenario-crop-editor__handle--ne" onMouseDown={(e) => handleResizeMouseDown(e, "ne")} title="Redimensionar" />
            <span className="scenario-crop-editor__handle scenario-crop-editor__handle--sw" onMouseDown={(e) => handleResizeMouseDown(e, "sw")} title="Redimensionar" />
            <span className="scenario-crop-editor__handle scenario-crop-editor__handle--se" onMouseDown={(e) => handleResizeMouseDown(e, "se")} title="Redimensionar" />
          </div>
        )}
      </div>
      {showHint && (
        <p className="scenario-crop-editor__hint">
          Arraste o retângulo para mover; use os cantos para redimensionar (proporção 16:9).
        </p>
      )}
    </div>
  );
}
