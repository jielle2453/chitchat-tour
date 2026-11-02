"use client";
// Phone-side navigation seam: the route-math contract
// (progressOnRoute, isOffRoute, navCue, routeToRouteDef, poisAlongRoute)
// lives in the geo module and is re-exported here, so hooks import from
// one place. This file adds what the geo module does not own: cue timing
// constants, detour selection, destination search filters, API wrappers.
import {
  isOffRoute,
  navCue,
  poisAlongRoute,
  progressOnRoute,
  routeToRouteDef,
  type RouteProgress,
} from "@/lib/geo/navigation";
import type { GeocodeResult, GeocodeResponse, Lang, NearbyPoi, WalkRoute } from "@/lib/types";
import { t } from "./i18n";

export { isOffRoute, navCue, poisAlongRoute, progressOnRoute, routeToRouteDef, type RouteProgress };

// ---------- tuning ----------

// Speak a turn cue once the maneuver is this close.
export const CUE_AT_M = 35;
// A narration playing this close to a turn is stopped for the cue;
// further away, the cue waits for the narration to finish.
export const CUE_CLOSE_M = 15;
// Remaining route under this means "arrived".
export const ARRIVE_M = 25;
// Off-route detection + reroute throttles.
export const OFF_ROUTE_M = 35;
export const OFF_ROUTE_S = 10;
export const REROUTE_MIN_S = 30;
// Wander detours: worthy POIs 60-200 m away, not roughly ahead.
export const DETOUR_MIN_M = 60;
export const DETOUR_MAX_M = 200;
export const DETOUR_AHEAD_DEG = 50;
export const DETOUR_GAP_MS = 5 * 60_000;
export const DETOUR_MAX_PER_WALK = 3;
// POIs within this corridor of the planned route count as "along the route".
export const ROUTE_CORRIDOR_M = 60;

export function angleDiff(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

// Signed difference in (-180, 180]: positive = target is clockwise (right) of heading.
export function signedDiff(target: number, heading: number): number {
  return ((((target - heading) % 360) + 540) % 360) - 180;
}

export function arrivalText(name: string, lang: Lang): string {
  const clean = name.trim();
  return clean ? t(lang, "navArrivedSay", { name: clean }) : t(lang, "navArrived");
}

// ---------- detours ----------

export type DetourDir = "left" | "right" | "behind";

// null = roughly ahead (no detour wording needed).
export function relativeDir(targetBearing: number, heading: number): DetourDir | null {
  const d = signedDiff(targetBearing, heading);
  if (Math.abs(d) <= DETOUR_AHEAD_DEG) return null;
  if (Math.abs(d) > 130) return "behind";
  return d < 0 ? "left" : "right";
}

const DETOUR_TOURISM = new Set(["museum", "gallery", "attraction", "viewpoint", "artwork"]);
const DETOUR_LEISURE = new Set(["park", "garden", "plaza", "playground"]);

// Worth interrupting a wander for: temples, markets, historic sites, parks, museums.
export function isDetourWorthy(poi: Pick<NearbyPoi, "kind" | "tags">): boolean {
  if (poi.kind === "place_of_worship" || poi.kind === "marketplace") return true;
  const tags = poi.tags ?? {};
  const get = (k: string): string => String(tags[k] ?? "").toLowerCase();
  if (get("amenity") === "place_of_worship" || get("amenity") === "marketplace") return true;
  if (get("historic")) return true;
  if (DETOUR_TOURISM.has(get("tourism"))) return true;
  if (DETOUR_LEISURE.has(get("leisure"))) return true;
  return false;
}

export interface DetourPick {
  poi: NearbyPoi;
  dir: DetourDir;
}

// Best detour suggestion candidate: ready narration, worthy kind,
// 60-200 m away and clearly off the current heading. Pure for tests.
export function selectDetourCandidate(
  pois: NearbyPoi[],
  fix: { heading: number | null | undefined },
  readyIds: Set<string>,
  skipIds: Set<string>,
): DetourPick | null {
  if (fix.heading === null || fix.heading === undefined) return null;
  let best: { poi: NearbyPoi; dir: DetourDir; rank: number } | null = null;
  for (const poi of pois) {
    if (!readyIds.has(poi.id) || skipIds.has(poi.id)) continue;
    if (!isDetourWorthy(poi)) continue;
    const d = poi.distanceM;
    if (!Number.isFinite(d) || d < DETOUR_MIN_M || d > DETOUR_MAX_M) continue;
    const dir = relativeDir(poi.bearingDeg, fix.heading);
    if (!dir) continue;
    const rank = poi.kind === "place_of_worship" || poi.kind === "marketplace" ? 2 : 1;
    if (!best || rank > best.rank || (rank === best.rank && d < best.poi.distanceM)) best = { poi, dir, rank };
  }
  return best ? { poi: best.poi, dir: best.dir } : null;
}

export function detourText(name: string, dir: DetourDir, lang: Lang): string {
  const dirKey = dir === "left" ? "dirLeft" : dir === "right" ? "dirRight" : "dirBehind";
  return t(lang, "detourSuggest", { name, dir: t(lang, dirKey) });
}

// ---------- destination search ----------

const VISIT_TOURISM = new Set(["museum", "gallery", "attraction", "viewpoint", "artwork"]);
const VISIT_LEISURE = new Set(["park", "garden", "plaza", "playground"]);

// "Nearby places" worth offering as a destination: named markets, temples, parks, museums and the like.
export function worthVisiting(poi: Pick<NearbyPoi, "kind" | "name" | "brand" | "tags">): boolean {
  const name = poi.name ?? poi.brand;
  if (!name || !name.trim()) return false;
  if (poi.kind === "marketplace" || poi.kind === "place_of_worship") return true;
  const tags = poi.tags ?? {};
  const get = (k: string): string => String(tags[k] ?? "").toLowerCase();
  if (get("amenity") === "place_of_worship" || get("amenity") === "marketplace") return true;
  if (get("historic")) return true;
  if (VISIT_TOURISM.has(get("tourism"))) return true;
  if (VISIT_LEISURE.has(get("leisure"))) return true;
  return false;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const msg = body && typeof body.error === "string" ? body.error : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body ?? {};
}

export async function fetchGeocode(
  query: string,
  fix: { lat: number; lon: number } | null,
  lang: Lang,
): Promise<GeocodeResult[]> {
  const params = new URLSearchParams({ q: query, lang });
  if (fix) {
    params.set("lat", String(fix.lat));
    params.set("lon", String(fix.lon));
  }
  const body = await readJson(await fetch(`/api/geocode?${params.toString()}`));
  return ((body.results ?? []) as GeocodeResult[]).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon));
}

export async function fetchGeocodeResponse(
  query: string,
  fix: { lat: number; lon: number } | null,
  lang: Lang,
): Promise<GeocodeResponse> {
  return { results: await fetchGeocode(query, fix, lang) };
}

export async function fetchNearby(lat: number, lon: number, radiusM = 500): Promise<NearbyPoi[]> {
  const body = await readJson(await fetch(`/api/nearby?lat=${lat}&lon=${lon}&radius=${radiusM}`));
  return ((body.pois ?? []) as NearbyPoi[]).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

export async function fetchWalkRoute(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  lang: Lang,
): Promise<WalkRoute> {
  const params = new URLSearchParams({ from: `${from.lat},${from.lon}`, to: `${to.lat},${to.lon}`, lang });
  const body = await readJson(await fetch(`/api/route?${params.toString()}`));
  const route = body.route as WalkRoute | undefined;
  if (!route || !Array.isArray(route.coordinates) || route.coordinates.length === 0 || !Array.isArray(route.steps)) {
    throw new Error("Invalid route");
  }
  return route;
}

export function etaMinutes(route: Pick<WalkRoute, "durationS" | "distanceM">, remainingM: number): number {
  if (route.distanceM <= 0) return 0;
  const total = Math.max(1, Math.round(route.durationS / 60));
  return Math.max(1, Math.round((remainingM / route.distanceM) * total));
}
