import { distanceM, nearbyPois } from "@/lib/geo";
import { fetchNearbyPois, withDistanceBearing } from "@/lib/geo/overpass";
import { allowRequest } from "@/lib/agent/guard";
import type { NearbyPoi } from "@/lib/types";

export const maxDuration = 60;

// Hand-fetched demo area (see data/osm/README.md): the static file wins here.
const BBOX = { south: 25.026, west: 121.5225, north: 25.04, east: 121.536 };
const DEDUPE_M = 30;

function inStaticArea(lat: number, lon: number): boolean {
  return lat >= BBOX.south && lat <= BBOX.north && lon >= BBOX.west && lon <= BBOX.east;
}

// Best-effort live top-up inside the demo area: null when Overpass is slow or
// down, so the static file always answers on time.
const LIVE_BUDGET_MS = 6000;

async function fetchLiveWithBudget(lat: number, lon: number, radiusM: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), LIVE_BUDGET_MS);
    });
    return await Promise.race([fetchNearbyPois(lat, lon, radiusM), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function GET(request: Request): Promise<Response> {
  if (!allowRequest()) return Response.json({ error: "Daily request limit reached. Try again tomorrow." }, { status: 429 });
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  const radiusM = Math.min(500, Math.max(50, Number(url.searchParams.get("radius")) || 250));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return Response.json({ error: "Invalid request: lat/lon must be valid coordinates." }, { status: 400 });
  }
  const fix = { lat, lon };
  const useStatic = inStaticArea(lat, lon);
  let staticPois: NearbyPoi[] = [];
  if (useStatic) {
    try {
      staticPois = nearbyPois({ lat, lon, accuracy: 10, heading: null, speed: null, timestamp: Date.now() }, radiusM);
    } catch {
      staticPois = [];
    }
  }
  // Live top-up everywhere: the static file only covers a few OSM kinds, so
  // temples, parks and named shops would otherwise stay invisible. Inside the
  // demo area the static file answers first: the live query only gets a short
  // budget and the route never depends on Overpass there.
  let live: NearbyPoi[] = [];
  let liveOk = false;
  try {
    const pois = useStatic ? await fetchLiveWithBudget(lat, lon, radiusM) : await fetchNearbyPois(lat, lon, radiusM);
    if (pois) {
      live = withDistanceBearing(pois, fix).filter((p) => p.distanceM <= radiusM);
      liveOk = true;
    }
  } catch (err) {
    if (!useStatic) return Response.json({ error: "Nearby lookup is unavailable right now." }, { status: 502 });
    console.error("overpass top-up failed, serving static only", err);
  }
  const merged = [...staticPois];
  for (const p of live) {
    if (merged.every((s) => distanceM(s, p) > DEDUPE_M)) merged.push(p);
  }
  merged.sort((a, b) => a.distanceM - b.distanceM);
  return Response.json({ pois: merged, source: useStatic ? (liveOk ? "static+live" : "static") : "live" });
}
