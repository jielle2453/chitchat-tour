// Sticker cut-out: clip a (face-blurred) photo to an object's SAM mask, or to a
// rounded box when there is no mask (e.g. mock-mode objects), add a thick white
// die-cut border that follows the silhouette, trim, and export a small PNG data URL.
// The soft shadow is applied in CSS at display time (drop-shadow filter), not baked in.
import type { DetectedObject } from "@/lib/types";

export const STICKER_MAX = 512; // longest side of the trimmed sticker, output px
export const WHITE_BORDER = 14; // white die-cut border, output px
export const DARK_LINE = 2; // thin outer keyline so the sticker reads on white, output px
export const TRIM_SLACK = 3; // extra transparent margin kept around the keyline, output px

export interface StickerLayout {
  boxW: number; // object width in source px
  boxH: number; // object height in source px
  scale: number; // source -> output; never upscales
  pad: number; // transparent padding around the box, in source px
  outW: number; // working canvas width, output px
  outH: number; // working canvas height, output px
}

// Bounding box of pixels with alpha above `threshold`, or null when fully transparent.
export function alphaBounds(data: Uint8ClampedArray, w: number, h: number, threshold = 8): [number, number, number, number] | null {
  let x1 = w;
  let y1 = h;
  let x2 = -1;
  let y2 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > threshold) {
        if (x < x1) x1 = x;
        if (x > x2) x2 = x;
        if (y < y1) y1 = y;
        if (y > y2) y2 = y;
      }
    }
  }
  return x2 < 0 ? null : [x1, y1, x2 + 1, y2 + 1];
}

// Scale so the object plus its outline fits STICKER_MAX; never upscale.
export function stickerScale(boxW: number, boxH: number, max = STICKER_MAX): number {
  const longest = Math.max(boxW, boxH, 1);
  return Math.min(1, (max - 2 * (WHITE_BORDER + DARK_LINE + TRIM_SLACK)) / longest);
}

// Corner radius for the rounded-box fallback, in the same units as w/h.
export function roundedBoxRadius(w: number, h: number): number {
  return Math.max(0, Math.min(w, h)) * 0.18;
}

// Pure layout math for makeSticker: output size, scale and source-px padding.
// The longest trimmed side is at most `max` (plus 1px rounding).
export function stickerLayout(boxW: number, boxH: number, max = STICKER_MAX): StickerLayout {
  const w = Math.max(1, boxW);
  const h = Math.max(1, boxH);
  const scale = stickerScale(w, h, max);
  const pad = (WHITE_BORDER + DARK_LINE + TRIM_SLACK) / scale; // source px
  return {
    boxW: w,
    boxH: h,
    scale,
    pad,
    outW: Math.max(1, Math.ceil((w + pad * 2) * scale)),
    outH: Math.max(1, Math.ceil((h + pad * 2) * scale)),
  };
}

function roundedBoxPath(x1: number, y1: number, x2: number, y2: number): Path2D {
  const r = roundedBoxRadius(x2 - x1, y2 - y1);
  const p = new Path2D();
  p.moveTo(x1 + r, y1);
  p.arcTo(x2, y1, x2, y2, r);
  p.arcTo(x2, y2, x1, y2, r);
  p.arcTo(x1, y2, x1, y1, r);
  p.arcTo(x1, y1, x2, y1, r);
  p.closePath();
  return p;
}

export function makeSticker(source: HTMLCanvasElement, obj: Pick<DetectedObject, "box" | "maskSvgPath">): string | null {
  const [bx1, by1, bx2, by2] = obj.box;
  if (![bx1, by1, bx2, by2].every((n) => Number.isFinite(n))) return null;
  if (bx2 <= bx1 || by2 <= by1) return null;
  const layout = stickerLayout(bx2 - bx1, by2 - by1);
  const { scale, pad } = layout;
  let path: Path2D;
  try {
    path = obj.maskSvgPath ? new Path2D(obj.maskSvgPath) : roundedBoxPath(bx1, by1, bx2, by2);
  } catch {
    path = roundedBoxPath(bx1, by1, bx2, by2);
  }
  const out = document.createElement("canvas");
  out.width = layout.outW;
  out.height = layout.outH;
  const ctx = out.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.scale(scale, scale);
  ctx.translate(pad - bx1, pad - by1);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  // Die-cut border: each stroke is centred on the silhouette, so half its width
  // lands outside. Dark keyline first, then the photo clipped to the raw shape on
  // top, leaving a WHITE_BORDER-wide white ring plus a DARK_LINE outer edge.
  ctx.fillStyle = "#111";
  ctx.strokeStyle = "#111";
  ctx.lineWidth = ((WHITE_BORDER + DARK_LINE) * 2) / scale;
  ctx.stroke(path);
  ctx.fill(path);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = (WHITE_BORDER * 2) / scale;
  ctx.stroke(path);
  ctx.fill(path);
  ctx.save();
  ctx.clip(path);
  ctx.drawImage(source, 0, 0);
  ctx.restore();

  // trim transparent margins
  const px = ctx.getImageData(0, 0, out.width, out.height);
  const b = alphaBounds(px.data, out.width, out.height);
  if (!b) return null;
  const trimmed = document.createElement("canvas");
  trimmed.width = b[2] - b[0];
  trimmed.height = b[3] - b[1];
  trimmed.getContext("2d")!.drawImage(out, b[0], b[1], trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
  return trimmed.toDataURL("image/png");
}
