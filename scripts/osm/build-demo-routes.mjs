// Builds the sample-walk paths (data/demo/past-walk-routes.json) over real OSM
// street graphs: waypoints snap to street nodes, legs are shortest paths.
// Usage: node scripts/osm/build-demo-routes.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;
const dist = (a, b) => {
  const h = Math.sin(rad(b[1] - a[1]) / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(b[0] - a[0]) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const key = (c) => `${c[0]},${c[1]}`;

function graph(file) {
  const streets = JSON.parse(readFileSync(join(root, "data/osm", file), "utf8"));
  const nodes = new Map();
  const adj = new Map();
  for (const way of streets) {
    for (let i = 0; i < way.coordinates.length; i++) {
      const c = way.coordinates[i];
      nodes.set(key(c), c);
      if (!i) continue;
      const p = way.coordinates[i - 1];
      const w = dist(p, c);
      for (const [a, b] of [[p, c], [c, p]]) (adj.get(key(a)) ?? adj.set(key(a), []).get(key(a))).push({ to: key(b), w });
    }
  }
  return { nodes, adj };
}

function route({ nodes, adj }, waypoints) {
  const snap = (c) => [...nodes.values()].reduce((best, n) => (dist(c, n) < dist(c, best) ? n : best));
  const pts = waypoints.map(snap);
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const s = key(pts[i - 1]), t = key(pts[i]);
    const d = new Map([[s, 0]]), prev = new Map(), todo = new Set([s]);
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
    if (!d.has(t)) throw new Error(`no path ${s} -> ${t}`);
    const leg = [];
    for (let k = t; k !== undefined; k = prev.get(k)) leg.push(nodes.get(k));
    leg.reverse();
    out.push(...(out.length ? leg.slice(1) : leg));
  }
  return out;
}

const WALKS = [
  {
    id: "tainan",
    streets: "streets-tainan.json",
    // Chihkan Tower -> down Xinmei St -> west on Minquan Rd -> up Haian Rd -> Shennong St
    waypoints: [[120.2027, 22.9974], [120.2011, 22.9973], [120.2006, 22.9958], [120.1985, 22.9962], [120.1966, 22.9975], [120.1950, 22.9980]],
  },
  {
    id: "dadaocheng",
    streets: "streets-dadaocheng.json",
    // Dihua St from Nanjing W Rd north to Guisui St, then Yanping N Rd back to Minsheng W Rd
    waypoints: [[121.5102, 25.0537], [121.5097, 25.0582], [121.5116, 25.0583], [121.5116, 25.0569]],
  },
  {
    id: "minsheng",
    streets: "streets-minsheng.json",
    // Fujin St east from Guangfu N Rd, down Xinzhong St, along Minsheng E Rd to the roundabout, up Sanmin Rd
    waypoints: [[121.5560, 25.0605], [121.5604, 25.0603], [121.5604, 25.0588], [121.5630, 25.0589], [121.5633, 25.0605]],
  },
  {
    id: "ximen",
    streets: "streets-ximen.json",
    // Ximen MRT up Hanzhong St, west on Wuchang St, down Kunming St, east on Chengdu Rd to the Red House
    waypoints: [[121.5074946, 25.042363], [121.5075397, 25.0445689], [121.505414, 25.0450678], [121.5048241, 25.0430204], [121.5068, 25.0423]],
  },
  {
    id: "zhongshan",
    streets: "streets-zhongshan.json",
    // Zhongshan MRT up Nanjing W Rd lane 25, into the Chifeng St lanes, out to Minsheng W Rd
    waypoints: [[121.5204, 25.0527], [121.5204, 25.0555], [121.5197, 25.0557], [121.5196, 25.0572], [121.5207, 25.0575], [121.5226, 25.0576]],
  },
];

const out = {};
for (const w of WALKS) {
  const coords = route(graph(w.streets), w.waypoints);
  out[w.id] = coords;
  console.log(w.id, Math.round(coords.reduce((s, c, i) => (i ? s + dist(coords[i - 1], c) : 0), 0)), "m,", coords.length, "points");
}
writeFileSync(join(root, "data/demo/past-walk-routes.json"), JSON.stringify(out));
