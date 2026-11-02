// Deterministic collage layout for the notebook day page: one sticker per
// row, alternating left/right, with room for a two-line label under each.
// Art boxes never overlap by construction, and the board grows with the count.
export interface Placed {
  id: string;
  x: number; // art centre, px in board space
  y: number;
  size: number; // art side, px
  rot: number; // degrees, applied to the art itself (its own transform is blend-safe)
  tileW: number; // label column width, px
}

export interface Scatter {
  items: Placed[];
  width: number;
  height: number;
}

// Vertical room one row needs below the art centre: half the art + label.
export const LABEL_H = 40;

export function scatterLayout(ids: string[], width = 360): Scatter {
  const n = ids.length;
  if (n === 0) return { items: [], width, height: 0 };
  const size = Math.round(width * 0.32);
  const tileW = Math.round(width * 0.44);
  const leftX = Math.round(width * 0.29);
  const rightX = width - leftX;
  const top = 28;
  const pitch = size + LABEL_H + 28;
  const height = top + size / 2 + (n - 1) * pitch + size / 2 + LABEL_H + 20;
  const items = ids.map((id, i) => ({
    id,
    x: i % 2 === 0 ? leftX : rightX,
    y: top + size / 2 + i * pitch,
    size,
    rot: i % 2 === 0 ? -4 : 4,
    tileW,
  }));
  return { items, width, height: Math.round(height) };
}
