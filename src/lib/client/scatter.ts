// Deterministic collage layout for the notebook day page.

export interface Placed {
  id: string;
  x: number; // centre, px in board space
  y: number;
  size: number; // sticker side, px
  rot: number; // degrees
}

export interface Scatter {
  items: Placed[];
  width: number;
  height: number;
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One sticker per grid cell (in the given order), jittered inside its cell. Neighbours overlap by < 20%.
export function scatterLayout(ids: string[], width = 360, cols = 2): Scatter {
  const n = ids.length;
  if (n === 0) return { items: [], width, height: 0 };
  const cellW = width / cols;
  const cellH = cellW * 1.05;
  const rows = Math.ceil(n / cols);
  const height = rows * cellH;
  const maxSize = cellW * 0.8;
  const extra = maxSize * 0.08;
  const items = ids.map((id, i) => {
    const r = rng(hash(id));
    const size = maxSize * (0.86 + r() * 0.14);
    const col = i % cols;
    const row = Math.floor(i / cols);
    // a last row with fewer stickers is centred
    const inRow = row === rows - 1 ? n - row * cols : cols;
    const colShift = inRow < cols ? ((cols - inRow) * cellW) / 2 : 0;
    const cx = col * cellW + cellW / 2 + colShift;
    const cy = row * cellH + cellH / 2;
    const jx = (cellW - size) / 2 + extra;
    const jy = (cellH - size) / 2 + extra;
    const dxMin = -Math.min(jx, cx - size / 2);
    const dxMax = Math.min(jx, width - size / 2 - cx);
    const dyMin = -Math.min(jy, cy - size / 2);
    const dyMax = Math.min(jy, height - size / 2 - cy);
    return {
      id,
      x: cx + dxMin + r() * (dxMax - dxMin),
      y: cy + dyMin + r() * (dyMax - dyMin),
      size,
      rot: (r() - 0.5) * 18,
    };
  });
  return { items, width, height };
}
