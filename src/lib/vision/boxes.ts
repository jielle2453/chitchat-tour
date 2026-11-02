export type Box = [number, number, number, number];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Spark returns boxes normalised to 0-1000; convert to image pixels, sorted and clamped.
export function scaleBox1000(box: readonly number[], width: number, height: number): Box | null {
  if (box.length !== 4 || box.some((n) => !Number.isFinite(n))) return null;
  const xs = [box[0], box[2]].sort((a, b) => a - b);
  const ys = [box[1], box[3]].sort((a, b) => a - b);
  const x1 = Math.round((clamp(xs[0], 0, 1000) * width) / 1000);
  const x2 = Math.round((clamp(xs[1], 0, 1000) * width) / 1000);
  const y1 = Math.round((clamp(ys[0], 0, 1000) * height) / 1000);
  const y2 = Math.round((clamp(ys[1], 0, 1000) * height) / 1000);
  if (x2 - x1 < 2 || y2 - y1 < 2) return null;
  return [x1, y1, x2, y2];
}

// Pixel box -> half-open box clamped inside the image, as SAM box prompts need.
export function toPromptBox(box: Box, width: number, height: number) {
  const left = clamp(Math.floor(box[0]), 0, width - 2);
  const top = clamp(Math.floor(box[1]), 0, height - 2);
  const right = clamp(Math.ceil(box[2]), left + 1, width - 1);
  const bottom = clamp(Math.ceil(box[3]), top + 1, height - 1);
  return { left, top, right, bottom };
}

// Scale and translate an absolute M/L/Z SVG path (mask raster space -> image space).
export function transformPath(path: string, sx: number, sy: number, dx: number, dy: number): string {
  let isX = true;
  return path.replace(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi, (m) => {
    const n = Number(m);
    const out = isX ? n * sx + dx : n * sy + dy;
    isX = !isX;
    return String(Math.round(out * 100) / 100);
  });
}
