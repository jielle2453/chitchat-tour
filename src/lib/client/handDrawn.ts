// Pure helpers for the hand-drawn walk map: seeded wobble, street clipping,
// geo projection, discovery ordering along the route, and sticker placement.
// No browser APIs; deterministic (seeded) so the map looks the same each visit.
import type { LatLon } from "./walkPath";

export interface StreetGeom {
  id: string;
  name: string;
  highway: string;
  coordinates: [number, number][]; // [lon, lat]
}

export interface GeoBbox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

// ---------- seeded random ----------

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- hand-drawn wobble ----------

// Jitters a sheet-space polyline with small perpendicular offsets so straight
// GIS lines read as ink. Endpoints stay fixed so the route meets its marks.
export function jitterPoints(pts: [number, number][], seed: string, amp = 2.2): [number, number][] {
  if (pts.length < 2) return pts.map((p) => [...p] as [number, number]);
  const rand = mulberry32(hashSeed(seed));
  // subdivide long runs so the wobble has a steady wavelength
  const dense: [number, number][] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const dist = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.round(dist / 26));
    for (let s = 1; s <= steps; s++) dense.push([ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps]);
  }
  return dense.map(([x, y], i) => {
    if (i === 0 || i === dense.length - 1) return [x, y];
    const [px, py] = dense[i - 1];
    const [nx, ny] = dense[i + 1];
    const dx = nx - px;
    const dy = ny - py;
    const len = Math.hypot(dx, dy) || 1;
    const off = (rand() - 0.5) * 2 * amp;
    return [x + (-dy / len) * off, y + (dx / len) * off];
  });
}

export function toPathD(pts: [number, number][]): string {
  return pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

// ---------- bbox + clipping ----------

export function walkBbox(path: LatLon[], padFrac = 0.18): GeoBbox {
  const lats = path.map((p) => p[0]);
  const lons = path.map((p) => p[1]);
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLon = Math.min(...lons);
  let maxLon = Math.max(...lons);
  // never a zero-area sheet (a straight street is still a walk)
  const minSpan = 0.0012;
  if (maxLat - minLat < minSpan) {
    const m = (minLat + maxLat) / 2;
    minLat = m - minSpan / 2;
    maxLat = m + minSpan / 2;
  }
  if (maxLon - minLon < minSpan) {
    const m = (minLon + maxLon) / 2;
    minLon = m - minSpan / 2;
    maxLon = m + minSpan / 2;
  }
  const padLat = (maxLat - minLat) * padFrac;
  const padLon = (maxLon - minLon) * padFrac;
  return { minLat: minLat - padLat, maxLat: maxLat + padLat, minLon: minLon - padLon, maxLon: maxLon + padLon };
}

const DROP_HIGHWAYS = new Set(["footway", "service", "steps", "cycleway", "construction"]);

function streetLengthdeg(s: StreetGeom): number {
  let len = 0;
  for (let i = 1; i < s.coordinates.length; i++) {
    len += Math.abs(s.coordinates[i][0] - s.coordinates[i - 1][0]) + Math.abs(s.coordinates[i][1] - s.coordinates[i - 1][1]);
  }
  return len;
}

// Keeps named streets touching the bbox, longest first, capped so the sheet
// stays quiet. Alley/service geometry is dropped — the walk line is the star.
export function clipStreets(streets: StreetGeom[], bbox: GeoBbox, maxStreets = 36): StreetGeom[] {
  const inBox = ([lon, lat]: [number, number]) => lon >= bbox.minLon && lon <= bbox.maxLon && lat >= bbox.minLat && lat <= bbox.maxLat;
  return streets
    .filter((s) => s.name && !DROP_HIGHWAYS.has(s.highway) && s.coordinates.some(inBox))
    .map((s) => ({ s, clipped: s.coordinates.filter(inBox) }))
    .filter(({ clipped }) => clipped.length >= 2)
    .sort((a, b) => streetLengthdeg(b.s) - streetLengthdeg(a.s))
    .slice(0, maxStreets)
    .map(({ s, clipped }) => ({ ...s, coordinates: clipped }));
}

// ---------- projection ----------

// Fits the bbox into a w x h sheet (longitude corrected by latitude).
export function projectGeo(lat: number, lon: number, bbox: GeoBbox, w: number, h: number, margin = 14): [number, number] {
  const midLat = (bbox.minLat + bbox.maxLat) / 2;
  const k = Math.cos((midLat * Math.PI) / 180);
  const spanX = Math.max((bbox.maxLon - bbox.minLon) * k, 1e-9);
  const spanY = Math.max(bbox.maxLat - bbox.minLat, 1e-9);
  const scale = Math.min((w - margin * 2) / spanX, (h - margin * 2) / spanY);
  const offX = (w - spanX * scale) / 2;
  const offY = (h - spanY * scale) / 2;
  return [offX + (lon - bbox.minLon) * k * scale, offY + (bbox.maxLat - lat) * scale];
}

// ---------- discoveries along the route ----------

// Fraction 0..1 of each point along the polyline (nearest segment, by length).
// Used so stickers pop in exactly when the drawn line reaches them.
export function fractionsAlongRoute(route: LatLon[], points: { lat: number; lon: number }[]): number[] {
  if (route.length < 2) return points.map(() => 0);
  const midLat = route.reduce((s, p) => s + p[0], 0) / route.length;
  const k = Math.cos((midLat * Math.PI) / 180);
  const px = (lat: number, lon: number): [number, number] => [lon * k, lat];
  const R = route.map(([lat, lon]) => px(lat, lon));
  const cum: number[] = [0];
  for (let i = 1; i < R.length; i++) cum.push(cum[i - 1] + Math.hypot(R[i][0] - R[i - 1][0], R[i][1] - R[i - 1][1]));
  const total = cum[cum.length - 1] || 1;
  return points.map(({ lat, lon }) => {
    const [x, y] = px(lat, lon);
    let best = 0;
    let bestD = Infinity;
    for (let i = 1; i < R.length; i++) {
      const [ax, ay] = R[i - 1];
      const [bx, by] = R[i];
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy || 1e-12;
      const tt = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / len2));
      const d = Math.hypot(x - (ax + dx * tt), y - (ay + dy * tt));
      if (d < bestD) {
        bestD = d;
        best = (cum[i - 1] + Math.sqrt(len2) * tt) / total;
      }
    }
    return Math.min(1, Math.max(0, best));
  });
}

// ---------- collage projection (local meters, cos(lat) corrected) ----------

const LAT_METERS = 110540;
const LON_METERS = 111320;

export interface MeterFrame {
  midLat: number;
  kx: number; // lonMeters(midLat): metres per degree of longitude
  minX: number; // metres east of lon 0, bbox edge
  minY: number; // metres north of the equator, bbox edge (south edge)
  sx: number; // bbox width, metres
  sy: number; // bbox height, metres
}

// Equirectangular frame for a bbox: x grows east, y grows north, in metres.
export function meterFrame(bbox: GeoBbox): MeterFrame {
  const midLat = (bbox.minLat + bbox.maxLat) / 2;
  const kx = LON_METERS * Math.cos((midLat * Math.PI) / 180);
  const minX = bbox.minLon * kx;
  const minY = bbox.minLat * LAT_METERS;
  return {
    midLat,
    kx,
    minX,
    minY,
    sx: Math.max(bbox.maxLon * kx - minX, 1e-6),
    sy: Math.max(bbox.maxLat * LAT_METERS - minY, 1e-6),
  };
}

export interface SheetRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Fits the meter frame into a rect, keeping aspect; returns the projection
// plus the px-per-metre scale (for the scale bar).
export function fitMeterFrame(m: MeterFrame, rect: SheetRect): {
  scale: number;
  project: (lat: number, lon: number) => [number, number];
} {
  const scale = Math.min(rect.w / m.sx, rect.h / m.sy);
  const offX = rect.x + (rect.w - m.sx * scale) / 2;
  const offY = rect.y + (rect.h - m.sy * scale) / 2;
  // y grows north in metres but down in sheet space: flip around the top.
  return {
    scale,
    project: (lat: number, lon: number) => [
      offX + (lon * m.kx - m.minX) * scale,
      offY + (m.sy - (lat * LAT_METERS - m.minY)) * scale,
    ],
  };
}

// Route-draw duration: linear in sticker count, clamped.
export function collageDurationMs(n: number): number {
  return Math.min(6000, Math.max(2500, 1800 + 450 * n));
}

// ---------- sticker placement ----------

export interface MapSticker {
  id: string;
  x: number; // centre, sheet px
  y: number;
  rot: number; // degrees, applied to the img itself (blend-safe)
}

// Nudges anchors apart on a deterministic spiral so illustrations never
// cover each other, and clamps everything inside the sheet.
export function layoutMapStickers(anchors: { id: string; x: number; y: number }[], size: number, w: number, h: number): MapSticker[] {
  const minD = size * 0.78;
  const half = size / 2;
  const placed: MapSticker[] = [];
  const step = size * 0.42;
  const rings: [number, number][] = [[0, 0]];
  for (let r = 1; r <= 4; r++) {
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2 + r * 0.4;
      rings.push([Math.cos(ang) * step * r, Math.sin(ang) * step * r]);
    }
  }
  for (const a of anchors) {
    let pick: [number, number] = [a.x, a.y];
    for (const [ox, oy] of rings) {
      const cx = Math.min(w - half, Math.max(half, a.x + ox));
      const cy = Math.min(h - half, Math.max(half, a.y + oy));
      if (placed.every((p) => Math.hypot(p.x - cx, p.y - cy) >= minD)) {
        pick = [cx, cy];
        break;
      }
      pick = [cx, cy];
    }
    const rot = (mulberry32(hashSeed(a.id))() - 0.5) * 14;
    placed.push({ id: a.id, x: pick[0], y: pick[1], rot });
  }
  return placed;
}

// ---------- collage placement (scrapbook margins) ----------

export interface CollageAnchor {
  id: string;
  rx: number; // route point, sheet px (where the discovery was met)
  ry: number;
}

export interface CollageSticker {
  id: string;
  x: number; // top-left of the size×size art box, sheet px
  y: number;
  rx: number; // route point this sticker belongs to
  ry: number;
  lx: number; // leader endpoint on the sticker-box edge nearest the route
  ly: number;
  side: "left" | "right";
  rot: number; // art rotation, degrees (-8..8, on the img itself)
  tapeRot: number; // tape rotation, degrees (±12..±20)
  labelRot: number; // label strip rotation, degrees (-2..2)
}

export interface CollageOpts {
  size: number; // art box, sheet px (92)
  w: number; // sheet width (viewBox units)
  h: number; // sheet height
  bandX0: number; // route band: left edge (central 46%)
  bandX1: number; // route band: right edge
  topPad: number; // stickers stay below the header zone
  bottomPad: number; // stickers stay above the footer/decoration zone
  labelH: number; // vertical room reserved under the art for the label strip
  gap: number; // minimum gap between sticker boxes (10)
  edgeGap: number; // gap between band edge and sticker box (8)
  routePts?: [number, number][]; // drawn route polyline, sheet px (for the crossing guard)
}

// Proper crossing of two segments (touching at endpoints does not count).
function segmentsCross(p1: [number, number], p2: [number, number], p3: [number, number], p4: [number, number]): boolean {
  const d = (a: [number, number], b: [number, number], c: [number, number]) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

// True when the leader from the sticker-box edge (ex,ey) to the route point
// (rx,ry) crosses the drawn route anywhere but at its own endpoint. The last
// 6px near the route point are ignored — the leader lands on the line there.
export function leaderCrossesRoute(route: [number, number][], ex: number, ey: number, rx: number, ry: number): boolean {
  const dx = ex - rx;
  const dy = ey - ry;
  const len = Math.hypot(dx, dy);
  if (len < 8) return false;
  const qx = rx + (dx / len) * 6;
  const qy = ry + (dy / len) * 6;
  for (let i = 1; i < route.length; i++) {
    if (segmentsCross([ex, ey], [qx, qy], route[i - 1], route[i])) return true;
  }
  return false;
}

// Places each discovery's art in the margin on the SAME side as its route
// point (point left of sheet centre -> left column, else right), at the same
// height (target y = point y - art/2). Collisions resolve by compressing
// first (±60px around the target, gap shrunk to 6px), then pushing down; only
// when a push would exceed ~80px is the other side tried, and only taken when
// its leader stays clear of the route — so leaders stay short and
// near-horizontal and never cross the route line. Anchors are settled in
// target-y order so stickers never leapfrog each other. Boxes never leave the
// sheet and sit clear of the header/footer zones. Deterministic.
export function layoutCollageStickers(anchors: CollageAnchor[], o: CollageOpts): CollageSticker[] {
  const edge = 4; // outermost sheet inset
  const MAX_PUSH = 80;
  const COMPACT_GAP = 6;
  const SCAN_STEPS = [6, -6, 12, -12, 18, -18, 24, -24, 30, -30, 36, -36, 42, -42, 48, -48, 54, -54, 60, -60]; // ±60px
  const boxH = o.size + o.labelH;
  const minY = o.topPad;
  const maxY = Math.max(minY, o.h - o.bottomPad - boxH);

  const boxOf = (x: number, y: number, g: number) => ({
    x0: x - g,
    y0: y - g,
    x1: x + o.size + g,
    y1: y + boxH + g,
  });
  const overlaps = (a: ReturnType<typeof boxOf>, b: ReturnType<typeof boxOf>) =>
    a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

  interface PlacedBox {
    x: number;
    y: number;
    gap: number;
  }
  const placed: PlacedBox[] = [];
  const isFree = (x: number, y: number, g: number) => {
    const mine = boxOf(x, y, g);
    return !placed.some((p) => overlaps(mine, boxOf(p.x, p.y, p.gap)));
  };

  const artOf = (x: number, y: number, g: number) => ({ x0: x - g, y0: y - g, x1: x + o.size + g, y1: y + o.size + g });
  const labelOf = (x: number, y: number) => ({ x0: x, y0: y + o.size, x1: x + o.size, y1: y + boxH });
  const xHits = (a: ReturnType<typeof boxOf>, b: ReturnType<typeof boxOf>) => a.x0 < b.x1 && b.x0 < a.x1;

  // Worst label-zone penetration of a candidate art box: art-vs-art overlap is
  // forbidden (Infinity), art-vs-label overlap is tolerated up to 24px.
  const MAX_LABEL_PEN = 24;
  const penOf = (x: number, y: number): number => {
    const art = artOf(x, y, COMPACT_GAP);
    const lab = labelOf(x, y);
    let pen = 0;
    for (const p of placed) {
      const pa = artOf(p.x, p.y, p.gap);
      if (overlaps(art, pa)) return Infinity;
      const pl = labelOf(p.x, p.y);
      if (xHits(art, pl)) pen = Math.max(pen, Math.min(art.y1, pl.y1) - Math.max(art.y0, pl.y0));
      if (xHits(pa, lab)) pen = Math.max(pen, Math.min(pa.y1, lab.y1) - Math.max(pa.y0, lab.y0));
    }
    return pen;
  };

  const xFor = (side: "left" | "right") =>
    Math.min(
      o.w - edge - o.size,
      Math.max(edge, side === "left" ? o.bandX0 - o.edgeGap - o.size : o.bandX1 + o.edgeGap),
    );

  // Pushes straight down past every colliding box. Returns null when the
  // column is full (ran past maxY).
  const settleDown = (x: number, fromY: number, g: number): number | null => {
    let y = Math.min(maxY, Math.max(minY, fromY));
    for (let pass = 0; pass <= placed.length; pass++) {
      if (isFree(x, y, g)) return y;
      // step below the highest colliding box
      const mine = boxOf(x, y, g);
      const hitTop = placed
        .filter((p) => overlaps(mine, boxOf(p.x, p.y, p.gap)))
        .reduce((top, p) => Math.min(top, p.y), Infinity);
      y = hitTop + boxH + g * 2;
      if (y > maxY) return null;
    }
    return y;
  };

  // Best slot on one side: exact target, then ±60px compression, then pushing
  // down. Returns the slot and its push below the clamped target (Infinity =
  // column full).
  const trySide = (a: CollageAnchor, side: "left" | "right"): { x: number; y: number; push: number } | null => {
    const x = xFor(side);
    const y0 = Math.min(maxY, Math.max(minY, a.ry - o.size / 2));
    if (isFree(x, y0, o.gap)) return { x, y: y0, push: 0 };
    for (const dy of SCAN_STEPS) {
      const y = Math.min(maxY, Math.max(minY, y0 + dy));
      if (isFree(x, y, COMPACT_GAP)) return { x, y, push: Math.abs(y - y0) };
    }
    const y = settleDown(x, y0, COMPACT_GAP);
    if (y == null) return null;
    return { x, y, push: y - y0 };
  };

  // Settle in target-y order so stickers never leapfrog; results are written
  // back in input order (callers map fractions by index).
  const order = anchors.map((a, i) => i).sort((p, q) => anchors[p].ry - anchors[q].ry);
  const out: CollageSticker[] = new Array(anchors.length);

  for (const i of order) {
    const a = anchors[i];
    const rand = mulberry32(hashSeed(`collage:${a.id}`));
    const rot = (rand() - 0.5) * 16;
    const tapeRot = (rand() < 0.5 ? -1 : 1) * (12 + rand() * 8);
    const labelRot = (rand() - 0.5) * 4;
    const home: "left" | "right" = a.rx < o.w / 2 ? "left" : "right";
    const away: "left" | "right" = home === "left" ? "right" : "left";

    let side = home;
    let slot = trySide(a, home);
    if (slot == null || slot.push > MAX_PUSH) {
      const alt = trySide(a, away);
      if (alt != null && (slot == null || alt.push < slot.push)) {
        // The far side only wins when its leader stays clear of the route.
        const lx = Math.min(alt.x + o.size, Math.max(alt.x, a.rx));
        const ly = Math.min(alt.y + o.size, Math.max(alt.y, a.ry));
        const crosses = o.routePts ? leaderCrossesRoute(o.routePts, lx, ly, a.rx, a.ry) : false;
        if (!crosses) {
          side = away;
          slot = alt;
        }
      }
    }
    let x = xFor(side);
    let y: number;
    if (slot == null) {
      // Both columns full: scan the home column from the top for the first
      // free slot, else pin to the bottom inside the sheet.
      x = xFor(home);
      side = home;
      y = minY;
      for (const p of [...placed].sort((p, q) => p.y - q.y)) {
        if (!isFree(x, y, COMPACT_GAP)) y = p.y + boxH + COMPACT_GAP * 2;
      }
      y = Math.min(o.h - edge - boxH, Math.max(minY, y));
    } else {
      x = slot.x;
      y = slot.y;
    }
    // A leader longer than ~140px is a layout failure: pin the sticker to its
    // target height on its home side instead, tolerating up to 24px of label
    // overlap (never art overlap). Home target-y leaders are near-horizontal
    // and stay well under the 160px hard ceiling.
    const leaderLen = (ex: number, ey: number) => Math.hypot(ex - a.rx, ey - a.ry);
    const edgeOf = (ex: number, ey: number): [number, number] => [
      Math.min(ex + o.size, Math.max(ex, a.rx)),
      Math.min(ey + o.size, Math.max(ey, a.ry)),
    ];
    {
      const [ex0, ey0] = edgeOf(x, y);
      if (leaderLen(ex0, ey0) > 140) {
        const hx = xFor(home);
        const hy0 = Math.min(o.h - edge - boxH, Math.max(minY, a.ry - o.size / 2));
        const steps = [0];
        for (let d = 4; d <= 200; d += 4) steps.push(d, -d);
        for (const dy of steps) {
          const cy = Math.min(o.h - edge - boxH, Math.max(minY, hy0 + dy));
          if (penOf(hx, cy) <= MAX_LABEL_PEN) {
            side = home;
            x = hx;
            y = cy;
            break;
          }
        }
      }
    }
    placed.push({ x, y, gap: COMPACT_GAP });
    // Nearest point on the art box to the route point = leader endpoint.
    const lx = Math.min(x + o.size, Math.max(x, a.rx));
    const ly = Math.min(y + o.size, Math.max(y, a.ry));

    out[i] = {
      id: a.id,
      x,
      y,
      rx: a.rx,
      ry: a.ry,
      lx: lx === a.rx && ly === a.ry ? x + (side === "left" ? o.size : 0) : lx,
      ly,
      side,
      rot,
      tapeRot,
      labelRot,
    };
  }
  return out;
}
