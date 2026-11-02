// One-time Overpass fetch for the Yongkang Street / Dongmen demo area.
// Usage: node scripts/osm/fetch-pois.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "..", "data", "osm");
const BBOX = "25.0260,121.5225,25.0400,121.5360"; // S,W,N,E
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const UA = "roadside-guide-hackathon/0.1 (one-time demo fetch; jacky841841@gmail.com)";

const QUERY = `[out:json][timeout:90];
(
  nwr["shop"="convenience"](${BBOX});
  nwr["highway"="traffic_signals"](${BBOX});
  nwr["highway"="bus_stop"](${BBOX});
  nwr["amenity"="place_of_worship"](${BBOX});
  nwr["amenity"="bicycle_rental"](${BBOX});
  nwr["amenity"="marketplace"](${BBOX});
  nwr["railway"="subway_entrance"](${BBOX});
);
out center tags;
way["highway"~"^(footway|pedestrian|residential|living_street|tertiary|secondary|service)$"]["name"](${BBOX});
out geom tags;`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: "data=" + encodeURIComponent(QUERY),
    });
    if (res.status === 429 && attempt === 0) {
      console.warn("429 from", url, "- waiting 30s");
      await sleep(30000);
      continue;
    }
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return res.json();
  }
  throw new Error(`${url} rate limited`);
}

let data;
for (const url of ENDPOINTS) {
  try {
    data = await post(url);
    console.log("fetched from", url, "osm3s:", data.osm3s?.timestamp_osm_base);
    break;
  } catch (e) {
    console.warn("failed:", e.message);
  }
}
if (!data) process.exit(1);

function kindOf(t) {
  if (t.shop === "convenience") return "convenience";
  if (t.highway === "traffic_signals") return "traffic_signals";
  if (t.highway === "bus_stop") return "bus_stop";
  if (t.amenity === "place_of_worship") return "place_of_worship";
  if (t.amenity === "bicycle_rental") return "bicycle_rental";
  if (t.amenity === "marketplace") return "marketplace";
  if (t.railway === "subway_entrance") return "subway_entrance";
  return "other";
}

const pois = [];
const streets = [];
for (const el of data.elements) {
  if (el.type === "way" && el.geometry && el.tags?.highway && !el.tags.shop && !el.tags.amenity) {
    streets.push({
      id: `way/${el.id}`,
      name: el.tags.name,
      highway: el.tags.highway,
      coordinates: el.geometry.map((g) => [g.lon, g.lat]),
    });
    continue;
  }
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) continue;
  const tags = el.tags ?? {};
  const poi = { id: `${el.type}/${el.id}`, kind: kindOf(tags), lat, lon, tags };
  if (tags.name) poi.name = tags["name:en"] ?? tags.name;
  if (tags.brand) poi.brand = tags["brand:en"] ?? tags.brand;
  pois.push(poi);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "yongkang.json"), JSON.stringify(pois, null, 1));
writeFileSync(join(outDir, "streets.json"), JSON.stringify(streets));
const counts = {};
for (const p of pois) counts[p.kind] = (counts[p.kind] ?? 0) + 1;
console.log("POIs:", pois.length, counts, "streets:", streets.length);
