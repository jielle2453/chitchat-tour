import "server-only";
import type { NearbyPoi, Poi, PoiKind } from "@/lib/types";
import { bearingDeg, haversineM } from "./math";

// Live POI lookup for anywhere outside the hand-fetched demo area.
// Queries public Overpass instances for interesting NAMED places and maps
// them onto the existing Poi shape, so the rest of the app never knows
// the difference. No API keys involved; be polite (short timeout, UA, cache).

const INSTANCES = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

// Backoff between mirror retries so a struggling instance is not hammered.
const RETRY_BASE_MS = 300;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const USER_AGENT = "RoadsideGuide/1.0 (walking-guide hackathon demo)";
const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_CELLS = 200;

// ~150 m grid cell: 150 / 111320 degrees of latitude; longitude is a little
// narrower in Taipei, which is fine for a cache key.
const CELL_DEG = 0.00135;

export function cellKey(lat: number, lon: number): string {
  return `${Math.floor(lat / CELL_DEG)}:${Math.floor(lon / CELL_DEG)}`;
}

function buildQuery(lat: number, lon: number, radiusM: number): string {
  const around = `around:${Math.round(radiusM)},${lat},${lon}`;
  return `[out:json][timeout:12];
(
  nwr["name"](${around})["shop"];
  nwr["name"](${around})["amenity"~"^(place_of_worship|school|marketplace|library|theatre|arts_centre|community_centre|food_court)$"];
  nwr["name"](${around})["leisure"~"^(park|garden|playground|plaza|common)$"];
  nwr["name"](${around})["historic"];
  nwr["name"](${around})["tourism"~"^(attraction|museum|gallery|artwork|viewpoint|hotel|guest_house)$"];
  nwr["name"](${around})["memorial"];
  nwr["name"](${around})["building"~"^(temple|church|shrine|chapel|mosque|cathedral)$"];
  nwr["name"](${around})["religion"];
);
out center tags 80;`;
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function kindFor(tags: Record<string, string>): PoiKind {
  if (tags.shop === "convenience") return "convenience";
  if (
    tags.amenity === "place_of_worship" ||
    tags.amenity === "marketplace" ||
    tags.building === "temple" ||
    tags.building === "church" ||
    tags.building === "shrine" ||
    tags.building === "chapel" ||
    tags.building === "mosque" ||
    tags.building === "cathedral" ||
    tags.religion !== undefined
  ) {
    return tags.amenity === "marketplace" ? "marketplace" : "place_of_worship";
  }
  if (tags.amenity === "marketplace") return "marketplace";
  return "other";
}

export function mapElementToPoi(el: OverpassElement): Poi | null {
  const tags = el.tags ?? {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  const name = tags["name:en"] ?? tags.name;
  if (lat === undefined || lon === undefined || !name) return null;
  return {
    id: `${el.type}/${el.id}`,
    kind: kindFor(tags),
    name,
    brand: tags["brand:en"] ?? tags.brand,
    lat,
    lon,
    tags,
  };
}

async function queryOne(endpoint: string, query: string): Promise<Poi[]> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status} from ${endpoint}`);
  const json = (await res.json()) as { elements?: OverpassElement[] };
  const out: Poi[] = [];
  const seen = new Set<string>();
  for (const el of json.elements ?? []) {
    const poi = mapElementToPoi(el);
    if (!poi || seen.has(poi.id)) continue;
    seen.add(poi.id);
    out.push(poi);
  }
  return out;
}

interface CacheEntry {
  at: number;
  pois: Poi[];
}

const cache = new Map<string, CacheEntry>();

export function clearOverpassCache(): void {
  cache.clear();
}

export async function fetchNearbyPois(lat: number, lon: number, radiusM: number): Promise<Poi[]> {
  const key = `${cellKey(lat, lon)}:${Math.round(radiusM)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.pois;
  const query = buildQuery(lat, lon, radiusM);
  let lastError: unknown = null;
  let attempt = 0;
  for (const endpoint of INSTANCES) {
    attempt += 1;
    if (attempt > 1) await sleep(RETRY_BASE_MS * (attempt - 1));
    try {
      const pois = await queryOne(endpoint, query);
      cache.set(key, { at: Date.now(), pois });
      if (cache.size > MAX_CACHE_CELLS) {
        const oldest = cache.keys().next();
        if (!oldest.done) cache.delete(oldest.value);
      }
      return pois;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Overpass lookup failed");
}

export function withDistanceBearing(pois: Poi[], at: { lat: number; lon: number }): NearbyPoi[] {
  return pois
    .map((p) => ({ ...p, distanceM: haversineM(at, p), bearingDeg: bearingDeg(at, p) }))
    .sort((a, b) => a.distanceM - b.distanceM);
}
