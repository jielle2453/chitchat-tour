// Pure helpers for recording a walk: path thinning, distance, day keys.
import { haversineM } from "@/lib/geo/math";

export type LatLon = [number, number]; // [lat, lon]

export const MIN_POINT_GAP_M = 8;
export const WALK_TIMEOUT_MS = 30 * 60_000;

export function pathDistanceM(path: LatLon[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += haversineM({ lat: path[i - 1][0], lon: path[i - 1][1] }, { lat: path[i][0], lon: path[i][1] });
  }
  return total;
}

// Append a point only when it is at least `minM` from the last kept point.
export function appendThinned(path: LatLon[], lat: number, lon: number, minM = MIN_POINT_GAP_M): { path: LatLon[]; addedM: number } {
  const last = path[path.length - 1];
  if (!last) return { path: [[lat, lon]], addedM: 0 };
  const d = haversineM({ lat: last[0], lon: last[1] }, { lat, lon });
  if (d < minM) return { path, addedM: 0 };
  return { path: [...path, [lat, lon]], addedM: d };
}

export function thinPath(points: LatLon[], minM = MIN_POINT_GAP_M): LatLon[] {
  let path: LatLon[] = [];
  for (const [lat, lon] of points) path = appendThinned(path, lat, lon, minM).path;
  return path;
}

// Local calendar day, "YYYY-MM-DD".
export function dayKey(ms: number): string {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function hiddenTooLong(hiddenAt: number | null, now: number, limitMs = WALK_TIMEOUT_MS): boolean {
  return hiddenAt !== null && now - hiddenAt > limitMs;
}

// Reduce a path to at most `max` points for drawing.
export function samplePath(path: LatLon[], max: number): LatLon[] {
  if (path.length <= max || max < 2) return path;
  const out: LatLon[] = [];
  for (let i = 0; i < max; i++) out.push(path[Math.round((i * (path.length - 1)) / (max - 1))]);
  return out;
}

// Fit a path into a w x h box (with margin) for an SVG polyline. Keeps aspect ratio, corrects longitude by latitude.
export function projectPath(path: LatLon[], w: number, h: number, margin = 6): [number, number][] {
  if (path.length === 0) return [];
  const lats = path.map((p) => p[0]);
  const lons = path.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max((maxLon - minLon) * k, 1e-6);
  const spanY = Math.max(maxLat - minLat, 1e-6);
  const scale = Math.min((w - margin * 2) / spanX, (h - margin * 2) / spanY);
  const offX = (w - spanX * scale) / 2;
  const offY = (h - spanY * scale) / 2;
  return path.map(([lat, lon]) => [offX + (lon - minLon) * k * scale, offY + (maxLat - lat) * scale]);
}
