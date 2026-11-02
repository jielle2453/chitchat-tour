// Builds data/routes/yongkang.json from data/osm/streets.json (real OSM way geometry).
// Waypoints are snapped to the nearest street node; legs are shortest paths on the street graph.
// Usage: node scripts/osm/build-route.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const streets = JSON.parse(readFileSync(join(root, "data/osm/streets.json"), "utf8"));
const pois = JSON.parse(readFileSync(join(root, "data/osm/yongkang.json"), "utf8"));

const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;
function dist(a, b) {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const key = (c) => `${c[0]},${c[1]}`;
const nodes = new Map(); // key -> coord
const adj = new Map(); // key -> [{to, w}]
for (const way of streets) {
  for (let i = 0; i < way.coordinates.length; i++) {
    const c = way.coordinates[i];
    nodes.set(key(c), c);
    if (i === 0) continue;
    const p = way.coordinates[i - 1];
    const w = dist(p, c);
    for (const [a, b] of [[p, c], [c, p]]) {
      if (!adj.has(key(a))) adj.set(key(a), []);
      adj.get(key(a)).push({ to: key(b), w });
    }
  }
}

function snap(c) {
  let best = null;
  let bd = Infinity;
  for (const n of nodes.values()) {
    const d = dist(c, n);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

function shortest(from, to) {
  const s = key(from), t = key(to);
  const d = new Map([[s, 0]]);
  const prev = new Map();
  const todo = new Set([s]);
  while (todo.size) {
    let u = null;
    for (const k of todo) if (u === null || d.get(k) < d.get(u)) u = k;
    todo.delete(u);
    if (u === t) break;
    for (const { to, w } of adj.get(u) ?? []) {
      const nd = d.get(u) + w;
      if (nd < (d.get(to) ?? Infinity)) { d.set(to, nd); prev.set(to, u); todo.add(to); }
    }
  }
  if (!d.has(t)) throw new Error("no path " + s + " -> " + t);
  const path = [];
  for (let k = t; k !== undefined; k = prev.get(k)) path.push(nodes.get(k));
  return path.reverse();
}

function build(waypoints) {
  const snapped = waypoints.map(snap);
  const out = [];
  for (let i = 1; i < snapped.length; i++) {
    const leg = shortest(snapped[i - 1], snapped[i]);
    out.push(...(out.length ? leg.slice(1) : leg));
  }
  return out;
}

const length = (cs) => cs.reduce((s, c, i) => (i ? s + dist(cs[i - 1], c) : 0), 0);
const exit = pois.find((p) => p.id === "node/3270313561"); // Dongmen MRT exit near Yongkang St

const routes = [
  {
    id: "yongkang",
    name: { en: "Yongkang Street walk", "zh-TW": "永康街散步", ja: "永康街さんぽ" },
    waypoints: [
      [exit.lon, exit.lat],
      [121.529656, 25.028648], // south end of Yongkang St (Jinan Rd side)
      [121.5282174, 25.0281704], // Lishui St / lane 33 corner
      [121.5292272, 25.0337412], // north end of Lishui St (Xinyi Rd)
    ],
  },
  {
    id: "jinhua",
    name: { en: "Jinhua Street short walk", "zh-TW": "金華街小巡禮", ja: "金華街ショートウォーク" },
    waypoints: [
      [exit.lon, exit.lat],
      [121.5295418, 25.0301502], // Yongkang St x Jinhua St
      [121.5285459, 25.0298827], // Jinhua St x Lishui St
      [121.5292272, 25.0337412], // Lishui St north end (Xinyi Rd)
    ],
  },
];

for (const r of routes) {
  const coordinates = build(r.waypoints);
  const near = {};
  for (const p of pois) {
    let m = Infinity;
    for (let i = 1; i < coordinates.length; i++) m = Math.min(m, dist([p.lon, p.lat], coordinates[i]));
    if (m <= 30 && p.kind !== "other") (near[p.kind] ??= []).push(`${p.id} ${p.name ?? p.brand ?? ""} ${Math.round(m)}m`);
  }
  writeFileSync(join(root, "data/routes", `${r.id}.json`), JSON.stringify({ id: r.id, name: r.name, coordinates }, null, 1));
  console.log(r.id, Math.round(length(coordinates)), "m,", coordinates.length, "points");
  for (const [k, v] of Object.entries(near)) console.log("  ", k, v.length, v.join("; "));
}
