// Sticker cut-out: clip a (face-blurred) photo to an object's mask or a rounded box,
// add a thick white outline and a thin dark one, trim, and export a small PNG data URL.
import type { DetectedObject } from "@/lib/types";

export const STICKER_MAX = 400;
export const WHITE_BORDER = 12; // output px
export const DARK_LINE = 2;

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
  return Math.min(1, (max - 2 * (WHITE_BORDER + DARK_LINE + 2)) / longest);
}

function roundedBoxPath(x1: number, y1: number, x2: number, y2: number): Path2D {
  const w = x2 - x1;
  const h = y2 - y1;
  const r = Math.min(w, h) * 0.18;
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
  const boxW = Math.max(1, bx2 - bx1);
  const boxH = Math.max(1, by2 - by1);
  const scale = stickerScale(boxW, boxH);
  const pad = (WHITE_BORDER + DARK_LINE + 3) / scale; // source px
  let path: Path2D;
  try {
    path = obj.maskSvgPath ? new Path2D(obj.maskSvgPath) : roundedBoxPath(bx1, by1, bx2, by2);
  } catch {
    path = roundedBoxPath(bx1, by1, bx2, by2);
  }
  const out = document.createElement("canvas");
  out.width = Math.ceil((boxW + pad * 2) * scale);
  out.height = Math.ceil((boxH + pad * 2) * scale);
  const ctx = out.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.scale(scale, scale);
  ctx.translate(pad - bx1, pad - by1);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  // dark hairline, white border, then the photo clipped to the shape
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
