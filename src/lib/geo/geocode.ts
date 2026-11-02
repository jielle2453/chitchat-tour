import "server-only";
import type { GeocodeResult, Lang, Poi } from "@/lib/types";
import poisJson from "@data/osm/yongkang.json";
import { haversineM } from "./math";

// Place search: static demo-area POIs first (instant + offline), then live
// Nominatim (Taipei-biased), merged and deduped. No API key needed; when the
// network is down the static/demo results are still served.

const STATIC_POIS = poisJson as unknown as Poi[];

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "RoadsideGuide/0.1 (hackathon demo)";
const REFERER = "http://localhost:3000/";
// left,top,right,bottom around Taipei; bounded=0 so places like Taipei 101
// just outside the box still resolve, ranked lower.
const VIEWBOX = "121.45,25.10,121.62,24.98";
const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 24 * 3600 * 1000;
const MAX_CACHE_ENTRIES = 300;
const MIN_QUERY_LEN = 2; // server-side guard: the client debounces/submits, never per-keystroke
const DEDUPE_M = 40;

// Small demo gazetteer for famous nearby places missing from the static OSM
// extract, so they resolve instantly and offline. Live Nominatim (dedupe
// below) wins with exact coordinates when reachable.
interface DemoPlace {
  id: string;
  names: string[];
  name: string;
  label: string;
  lat: number;
  lon: number;
  kind: string;
}

const DEMO_PLACES: DemoPlace[] = [
  {
    id: "demo:yongkang-park",
    names: ["永康公園", "yongkang park", "永康公园"],
    name: "永康公園",
    label: "Da'an District, Taipei",
    lat: 25.0316,
    lon: 121.5298,
    kind: "park",
  },
  {
    id: "demo:cks-hall",
    names: ["中正紀念堂", "chiang kai-shek memorial hall", "cks memorial hall", "中正纪念堂"],
    name: "中正紀念堂",
    label: "Zhongzheng District, Taipei",
    lat: 25.0354,
    lon: 121.5203,
    kind: "memorial",
  },
  {
    id: "demo:daan-park",
    names: ["大安森林公園", "daan forest park", "daan park", "大安森林公园"],
    name: "大安森林公園",
    label: "Da'an District, Taipei",
    lat: 25.0296,
    lon: 121.5345,
    kind: "park",
  },
  {
    id: "demo:taipei-101",
    names: ["台北101", "taipei 101", "taipei101", "台北１０１"],
    name: "台北101",
    label: "Xinyi District, Taipei",
    lat: 25.0339,
    lon: 121.5645,
    kind: "tower",
  },
];

// ---------- Nominatim throttle: global, at most 1 request/second ----------

let tail: Promise<void> = Promise.resolve();
let lastStart = 0;

async function takeSlot(): Promise<void> {
  let release!: () => void;
  const slot = new Promise<void>((resolve) => {
    release = resolve;
  });
  const prev = tail;
  tail = prev.then(() => slot);
  await prev;
  const wait = lastStart + 1000 - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastStart = Date.now();
  release();
}

// ---------- LRU cache keyed by query+lang, 24 h ----------

interface CacheEntry {
  at: number;
  results: GeocodeResult[];
}

const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): GeocodeResult[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, hit);
  return hit.results;
}

function cacheSet(key: string, results: GeocodeResult[]): void {
  cache.delete(key);
  cache.set(key, { at: Date.now(), results });
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

export function clearGeocodeCache(): void {
  cache.clear();
}

export function resetGeocodeState(): void {
  cache.clear();
  tail = Promise.resolve();
  lastStart = 0;
}

// ---------- Local search ----------

function scoreMatch(needle: string, candidates: string[]): number {
  let best = 0;
  for (const raw of candidates) {
    const cand = raw.toLowerCase();
    if (cand === needle) best = Math.max(best, 100);
    else if (cand.startsWith(needle)) best = Math.max(best, 50);
    else if (cand.includes(needle)) best = Math.max(best, 25);
  }
  return best;
}

function poiNames(poi: Poi): string[] {
  const names = new Set<string>();
  if (poi.name) names.add(poi.name);
  if (poi.brand) names.add(poi.brand);
  for (const [k, v] of Object.entries(poi.tags ?? {})) {
    if (k === "name" || k.startsWith("name:") || k === "brand" || k === "alt_name" || k.startsWith("alt_name") || k.startsWith("old_name")) {
      names.add(v);
    }
  }
  return [...names];
}

function staticLabel(poi: Poi): string {
  const tags = poi.tags ?? {};
  const district = tags["addr:district"] ?? tags["addr:city"];
  const street = tags["addr:street"] ?? tags["addr:road"];
  const parts = [district, street].filter((s): s is string => !!s);
  if (parts.length > 0) return parts.join(", ");
  const en = tags["name:en"];
  if (en && en !== poi.name) return en;
  return "Taipei";
}

function poiToResult(poi: Poi): GeocodeResult {
  return {
    id: `osm:${poi.id}`,
    name: poi.name ?? poi.brand ?? "Unnamed place",
    label: staticLabel(poi),
    lat: poi.lat,
    lon: poi.lon,
    kind: poi.kind,
  };
}

function searchStatic(q: string): GeocodeResult[] {
  const needle = q.trim().toLowerCase();
  const scored: { poi: Poi; score: number }[] = [];
  for (const poi of STATIC_POIS) {
    const score = scoreMatch(needle, poiNames(poi));
    if (score > 0) scored.push({ poi, score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ poi }) => poiToResult(poi));
}

function searchDemo(q: string): GeocodeResult[] {
  const needle = q.trim().toLowerCase();
  const out: { place: DemoPlace; score: number }[] = [];
  for (const place of DEMO_PLACES) {
    const score = scoreMatch(needle, place.names);
    if (score > 0) out.push({ place, score });
  }
  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ place }) => ({
      id: place.id,
      name: place.name,
      label: place.label,
      lat: place.lat,
      lon: place.lon,
      kind: place.kind,
    }));
}

// ---------- Nominatim ----------

interface NominatimItem {
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  class: string;
  type: string;
  address?: Record<string, string>;
}

function mapNominatim(item: NominatimItem): GeocodeResult {
  const first = item.display_name.split(",")[0]?.trim() || item.display_name;
  const a = item.address ?? {};
  const area =
    a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district ?? a.district ?? a.city ?? "";
  const road = a.road ?? a.pedestrian ?? "";
  const label =
    [area, road].filter(Boolean).join(", ") ||
    item.display_name.split(",").slice(1, 3).join(",").trim() ||
    "Taipei";
  return {
    id: `osm:${item.osm_type}/${item.osm_id}`,
    name: first,
    label,
    lat: Number(item.lat),
    lon: Number(item.lon),
    kind: item.type,
  };
}

async function searchNominatim(q: string, lang: Lang): Promise<GeocodeResult[]> {
  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    addressdetails: "1",
    limit: "6",
    "accept-language": lang,
    viewbox: VIEWBOX,
    bounded: "0",
  });
  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { "User-Agent": USER_AGENT, Referer: REFERER, Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const items = (await res.json()) as NominatimItem[];
  return items.map(mapNominatim);
}

// ---------- Entry point ----------

export interface GeocodeOptions {
  q: string;
  lat?: number;
  lon?: number;
  lang?: Lang;
}

export async function geocodePlace(opts: GeocodeOptions): Promise<GeocodeResult[]> {
  const q = opts.q.trim();
  if (q.length < MIN_QUERY_LEN) return [];
  const lang = opts.lang ?? "zh-TW";
  const key = `${lang}:${q.toLowerCase()}`;

  let live = cacheGet(key);
  if (!live) {
    try {
      await takeSlot();
      live = await searchNominatim(q, lang);
      cacheSet(key, live);
    } catch (err) {
      console.error("geocode: nominatim failed, serving static only", err);
      live = [];
    }
  }

  let ranked = live;
  if (opts.lat !== undefined && opts.lon !== undefined) {
    const at = { lat: opts.lat, lon: opts.lon };
    ranked = [...live].sort((a, b) => haversineM(at, a) - haversineM(at, b));
  }

  const merged = [...searchStatic(q), ...searchDemo(q)];
  for (const r of ranked) {
    if (merged.every((m) => haversineM(m, r) > DEDUPE_M)) merged.push(r);
  }
  return merged.slice(0, 8);
}
