// One-time Overpass fetch of named street geometry for the sample-walk areas
// beyond Yongkang (drawn faintly on the walk page, and used to build routes).
// Usage: node scripts/osm/fetch-demo-streets.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "osm");
const ALL_AREAS = {
  dadaocheng: "25.0520,121.5050,25.0640,121.5150", // S,W,N,E
  tainan: "22.9900,120.1950,23.0020,120.2080",
  minsheng: "25.0540,121.5510,25.0640,121.5650",
  ximen: "25.0380,121.5020,25.0480,121.5120",
  zhongshan: "25.0500,121.5160,25.0600,121.5260",
};
// node fetch-demo-streets.mjs [id ...] — default: all areas
const pick = process.argv.slice(2);
const AREAS = pick.length ? Object.fromEntries(pick.map((id) => [id, ALL_AREAS[id]])) : ALL_AREAS;
const UA = "roadside-guide-hackathon/0.1 (one-time demo fetch; jacky841841@gmail.com)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const [id, bbox] of Object.entries(AREAS)) {
  const q = `[out:json][timeout:90];
way["highway"~"^(footway|pedestrian|residential|living_street|tertiary|secondary|primary|unclassified|service)$"]["name"](${bbox});
out geom tags;`;
  let data;
  const urls = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
  for (let attempt = 0; attempt < 6 && !data; attempt++) {
    const url = urls[attempt % urls.length];
    if (attempt >= urls.length) await sleep(10000);
    try {
      const res = await fetch(url, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q), signal: AbortSignal.timeout(90000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (e) {
      console.warn(id, url, e.message);
    }
  }
  if (!data) {
    process.exitCode = 1;
    continue;
  }
  const streets = data.elements
    .filter((el) => el.type === "way" && el.geometry)
    .map((el) => ({ id: `way/${el.id}`, name: el.tags.name, highway: el.tags.highway, coordinates: el.geometry.map((g) => [g.lon, g.lat]) }));
  writeFileSync(join(outDir, `streets-${id}.json`), JSON.stringify(streets));
  console.log(id, "streets:", streets.length);
  await sleep(3000);
}
