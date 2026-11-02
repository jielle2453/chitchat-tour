// Pure geometry helpers for the photo pipeline.

export type Box = [number, number, number, number]; // x1, y1, x2, y2

export function fitWithin(width: number, height: number, maxSide: number) {
  const longest = Math.max(width, height);
  const scale = longest > maxSide ? maxSide / longest : 1;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}

// Grow a box by `ratio` of its size on every side, clamped to the image.
export function expandBox(box: Box, ratio: number, imgW: number, imgH: number): Box {
  const [x1, y1, x2, y2] = box;
  const dx = (x2 - x1) * ratio;
  const dy = (y2 - y1) * ratio;
  return [
    Math.max(0, Math.floor(x1 - dx)),
    Math.max(0, Math.floor(y1 - dy)),
    Math.min(imgW, Math.ceil(x2 + dx)),
    Math.min(imgH, Math.ceil(y2 + dy)),
  ];
}

export function pixelBlockSize(box: Box): number {
  const w = box[2] - box[0];
  const h = box[3] - box[1];
  return Math.max(6, Math.round(Math.min(w, h) / 6));
}
