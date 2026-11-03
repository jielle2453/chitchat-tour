import "server-only";
import type { RouteStep, WalkRoute } from "@/lib/types";
import { haversineM } from "./math";

// Walking routes from the FOSSGIS foot router (OSRM-compatible API), mapped
// onto the WalkRoute contract. No API key needed; when the router is
// unreachable a straight-line fallback is served instead.

const ROUTER_BASE = "https://routing.openstreetmap.de/routed-foot/route/v1/foot";
const USER_AGENT = "RoadsideGuide/0.1 (hackathon demo)";
const FETCH_TIMEOUT_MS = 10_000;
export const MAX_WALK_M = 8000;
const WALK_MPS = 1.3;
const MAX_CACHE_ENTRIES = 200;
const CACHE_TTL_MS = 24 * 3600 * 1000;

export class RouteTooLongError extends Error {
  readonly distanceM: number;
  constructor(distanceM: number) {
    super(`Route is too long for walking (${Math.round(distanceM)} m over 8 km).`);
    this.name = "RouteTooLongError";
    this.distanceM = distanceM;
  }
}

interface CacheEntry {
  at: number;
  route: WalkRoute;
}

const cache = new Map<string, CacheEntry>();

// ~10 m grid: 4 decimals of latitude is ~11 m in Taipei.
function cacheKey(from: { lat: number; lon: number }, to: { lat: number; lon: number }): string {
  return `${from.lat.toFixed(4)},${from.lon.toFixed(4)}>${to.lat.toFixed(4)},${to.lon.toFixed(4)}`;
}

function cacheGet(key: string): WalkRoute | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, hit);
  return hit.route;
}

function cacheSet(key: string, route: WalkRoute): void {
  cache.delete(key);
  cache.set(key, { at: Date.now(), route });
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

export function clearRouteCache(): void {
  cache.clear();
}

interface OsrmStep {
  maneuver: { type: string; modifier?: string; location: [number, number] };
  name: string;
  distance: number;
}

interface OsrmResponse {
  code: string;
  routes?: {
    distance: number;
    duration: number;
    geometry: { coordinates: [number, number][] };
    legs: { steps: OsrmStep[] }[];
  }[];
}

function mapStep(s: OsrmStep): RouteStep {
  return {
    type: s.maneuver.type,
    modifier: s.maneuver.modifier,
    location: s.maneuver.location,
    name: s.name ?? "",
    distanceM: s.distance ?? 0,
  };
}

// All router paths through the given points in order. With alternatives,
// the router returns up to a few distinct paths between the first and last
// point (OSRM ignores alternatives together with waypoints, so pass exactly
// two points then). Throws when the router has no route.
export async function fetchOsrmRoutes(
  points: { lat: number; lon: number }[],
  alternatives = false,
): Promise<WalkRoute[]> {
  if (points.length < 2) throw new Error("foot router: need at least two points");
  const url =
    `${ROUTER_BASE}/${points.map((p) => `${p.lon},${p.lat}`).join(";")}` +
    `?overview=full&geometries=geojson&steps=true${alternatives ? "&alternatives=true" : ""}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`foot router ${res.status}`);
  const json = (await res.json()) as OsrmResponse;
  const routes = json.code === "Ok" ? (json.routes ?? []) : [];
  if (routes.length === 0) throw new Error(`foot router: ${json.code ?? "no route"}`);
  return routes.map((r) => ({
    coordinates: r.geometry.coordinates,
    distanceM: r.distance,
    durationS: r.duration,
    steps: r.legs.flatMap((leg) => leg.steps.map(mapStep)),
  }));
}

async function fetchRoute(from: { lat: number; lon: number }, to: { lat: number; lon: number }): Promise<WalkRoute> {
  return (await fetchOsrmRoutes([from, to]))[0];
}

export function straightLineRoute(from: { lat: number; lon: number }, to: { lat: number; lon: number }): WalkRoute {
  const distanceM = haversineM(from, to);
  return {
    coordinates: [
      [from.lon, from.lat],
      [to.lon, to.lat],
    ],
    distanceM,
    durationS: distanceM / WALK_MPS,
    steps: [{ type: "arrive", location: [to.lon, to.lat], name: "", distanceM }],
  };
}

export interface RouteResult {
  route: WalkRoute;
  fallback: boolean; // true when the router failed and a straight line is served
}

export async function getRoute(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): Promise<RouteResult> {
  const key = cacheKey(from, to);
  const hit = cacheGet(key);
  if (hit) return { route: hit, fallback: false };

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const route = await fetchRoute(from, to);
      if (route.distanceM > MAX_WALK_M) throw new RouteTooLongError(route.distanceM);
      cacheSet(key, route);
      return { route, fallback: false };
    } catch (err) {
      if (err instanceof RouteTooLongError) throw err;
      lastError = err;
    }
  }
  console.error("route: foot router failed, serving straight-line fallback", lastError);
  const fallback = straightLineRoute(from, to);
  if (fallback.distanceM > MAX_WALK_M) throw new RouteTooLongError(fallback.distanceM);
  return { route: fallback, fallback: true };
}
