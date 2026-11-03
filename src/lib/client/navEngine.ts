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
export const DETOUR_FIRST_MS = 3 * 60_000; // no detour card in the first minutes of a walk
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

// ---------- localized names ----------

// The static extract and live Overpass both store English in `name` but keep
// the full OSM tag set, which usually carries the local name. Prefer the tag
// for the UI language, then the stored name/brand. Falls back to `kind` so
// callers can always render something.
const NAME_TAG_KEYS: Record<Lang, string[]> = {
  "zh-TW": ["name:zh-TW", "name:zh-Hant", "name:zh", "name"],
  ja: ["name:ja"],
  en: ["name:en"],
  ko: ["name:ko", "name:en"],
};

export function displayName(poi: Pick<NearbyPoi, "kind" | "name" | "brand" | "tags">, lang: Lang): string {
  const tags = poi.tags ?? {};
  for (const key of NAME_TAG_KEYS[lang] ?? NAME_TAG_KEYS.en) {
    const v = tags[key]?.trim();
    if (v) return v;
  }
  // The stored `name` is English in this dataset; the OSM default name tag
  // underneath is usually the local name, so it outranks the brand.
  const name = poi.name?.trim();
  if (name) return name;
  const local = tags.name?.trim();
  if (local) return local;
  const brand = poi.brand?.trim();
  if (brand) return brand;
  return poi.kind;
}

// ---------- map-tap pick places ----------

// Named places offered right after a map tap: the closest named POIs
// within this radius of the tap.
export const PICK_PLACES_RADIUS_M = 60;
export const PICK_PLACES_LIMIT = 3;

// Road furniture and transit stops are named after intersections but are not
// places to walk to: signals, crossings, bus stops and bike docks.
function isNonPlace(poi: Pick<NearbyPoi, "kind" | "tags">): boolean {
  if (poi.kind === "traffic_signals" || poi.kind === "bus_stop" || poi.kind === "bicycle_rental") return true;
  const tags = poi.tags ?? {};
  const get = (k: string): string => String(tags[k] ?? "").toLowerCase();
  if (get("highway") === "traffic_signals" || get("highway") === "crossing") return true;
  if (get("railway") === "crossing" || get("railway") === "level_crossing") return true;
  if (Object.keys(tags).some((k) => k.toLowerCase() === "crossing")) return true;
  return false;
}

// Closest named places first, at most `limit`. The caller measures
// distanceM from the tap (e.g. /api/nearby with the tap as the fix).
export function selectPickPlaces(
  pois: NearbyPoi[],
  radiusM: number = PICK_PLACES_RADIUS_M,
  limit: number = PICK_PLACES_LIMIT,
): NearbyPoi[] {
  return pois
    .filter((p) => !isNonPlace(p))
    .filter((p) => (p.name ?? p.brand)?.trim() && Number.isFinite(p.distanceM) && p.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, Math.max(0, limit));
}

// Latest-wins guard for overlapping async requests (tap plans, nearby
// lookups, route fetches): each request takes a token with issue(), and a
// response is applied only while its token isLatest(). Stale responses are
// dropped, so rapid taps never apply out of order.
export class TakeLatest {
  private seq = 0;
  issue(): number {
    this.seq += 1;
    return this.seq;
  }
  isLatest(token: number): boolean {
    return token === this.seq;
  }
  // Invalidate every outstanding token (e.g. leaving the flow).
  reset(): void {
    this.seq += 1;
  }
}

// ---------- route options ----------

// Extra response fields when GET /api/route is called with alternatives=1.
// Defined here (not in lib/types, which is lead-owned): routes[0] is always
// the fastest route; routes[1] is the "hear more" route when one qualified.
export interface RouteOptions {
  fastest: WalkRoute;
  hearMore: WalkRoute | null;
  routes: WalkRoute[];
  stories: number[]; // story-worthy places per route, same order as routes
}

export async function fetchWalkRouteOptions(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  lang: Lang,
  hometown?: string,
): Promise<RouteOptions> {
  const params = new URLSearchParams({ from: `${from.lat},${from.lon}`, to: `${to.lat},${to.lon}`, lang, alternatives: "1" });
  if (hometown) params.set("hometown", hometown);
  const body = await readJson(await fetch(`/api/route?${params.toString()}`));
  const fastest = body.route as WalkRoute | undefined;
  if (!fastest || !Array.isArray(fastest.coordinates) || fastest.coordinates.length === 0 || !Array.isArray(fastest.steps)) {
    throw new Error("Invalid route");
  }
  const routes = (Array.isArray(body.routes) ? body.routes : [fastest]).filter(
    (r): r is WalkRoute => !!r && Array.isArray(r.coordinates) && r.coordinates.length > 0 && Array.isArray(r.steps),
  );
  if (routes.length === 0) throw new Error("Invalid route");
  const stories = Array.isArray(body.stories) ? body.stories.map((n) => (Number.isFinite(n) ? Math.max(0, Math.round(n as number)) : 0)) : routes.map(() => 0);
  return { fastest: routes[0], hearMore: routes.length > 1 ? routes[1] : null, routes, stories };
}
