// Demo seeding for the notebook: writes realistic past walks in other parts of
// Taiwan (Tainan, Dadaocheng) into the same client storage the walk uses, so
// the Notebook tab has history beside the simulated Yongkang walk. Titles,
// facts and sources come from the real knowledge base; paths follow real OSM
// streets (scripts/osm/build-demo-routes.mjs). Every id has a corresponding
// public/illustrations/<itemId>.webp.
"use client";
import type { Discovery, KnowledgeItem, Lang, LocalizedText, WalkMode, WalkRecord } from "@/lib/types";
import { localized } from "./i18n";
import { readDiscoveries, readStored, readWalks, writeStored } from "./storage";
import { KEYS, migrateDiscoveries } from "./storageFormat";
import { pathDistanceM, thinPath, type LatLon } from "./walkPath";

export interface PastWalkDef {
  id: string;
  route: string; // key in data/demo/past-walk-routes.json
  daysAgo: number;
  start: [number, number]; // local hour, minute
  gapMin: number; // minutes between stories
  mode: WalkMode;
  areaName: string;
  destination?: { name: LocalizedText; lat: number; lon: number };
  itemIds: string[];
}

// None of these repeat a story from the recorded Tokyo walk.
export const DEMO_PAST_WALKS: PastWalkDef[] = [
  {
    id: "demo-walk-dadaocheng",
    route: "dadaocheng",
    daysAgo: 1,
    start: [15, 20],
    gapMin: 5,
    mode: "wander",
    areaName: "Dadaocheng",
    itemIds: ["arcade-qilou-origin", "arcade-is-road", "joss-paper-burners", "iron-window-bars"],
  },
  {
    id: "demo-walk-minsheng",
    route: "minsheng",
    daysAgo: 2,
    start: [19, 5],
    gapMin: 4,
    mode: "wander",
    areaName: "Minsheng Community",
    itemIds: ["garbage-truck-why-music", "garbage-truck-japan-origin", "garbage-truck-maidens-prayer", "taipei-pay-as-you-throw", "few-public-trash-cans"],
  },
  {
    id: "demo-walk-tainan",
    route: "tainan",
    daysAgo: 3,
    start: [8, 10],
    gapMin: 6,
    mode: "destination",
    areaName: "Tainan",
    destination: { name: { en: "Shennong Street", "zh-TW": "神農街", ja: "神農街" }, lat: 22.998, lon: 120.195 },
    itemIds: ["breakfast-hot-food", "convenience-store-bill-payment", "two-stage-left-turn-tainan", "manhole-covers-art"],
  },
  {
    id: "demo-walk-ximen",
    route: "ximen",
    daysAgo: 4,
    start: [20, 10],
    gapMin: 5,
    mode: "destination",
    areaName: "Ximending",
    destination: { name: { en: "The Red House", "zh-TW": "西門紅樓", ja: "西門紅樓" }, lat: 25.0421, lon: 121.5068 },
    itemIds: ["mrt-fare-gate-yellow-line", "pedestrian-green-man-run-animation", "convenience-store-area-density", "youbike-free-30-min"],
  },
  {
    id: "demo-walk-zhongshan",
    route: "zhongshan",
    daysAgo: 5,
    start: [14, 30],
    gapMin: 5,
    mode: "wander",
    areaName: "Zhongshan",
    itemIds: ["overhead-power-lines", "manhole-anti-slip", "convenience-store-tax-payment", "household-trash-in-public-bins-fine", "two-stage-left-turn-origin"],
  },
];

export interface SeedInput {
  items: KnowledgeItem[];
  routes: Record<string, [number, number][]>; // [lon, lat], walking order
  lang: Lang;
  hometown: string;
  now: number;
  walks?: PastWalkDef[];
}

export interface SeedData {
  discoveries: SeedDiscovery[];
  walks: WalkRecord[];
}

export type SeedDiscovery = Discovery;

const MIN = 60_000;

const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/;

// First clause of a sentence, for one-line chips.
function firstClause(text: string): string {
  const m = /^([^,，.。;；、!！?？]+)/.exec(text.trim());
  return (m ? m[1] : text).trim();
}

// Short one-liner: at most ~20 CJK chars or 12 words.
export function shortenLine(text: string): string {
  const clause = firstClause(text);
  if (CJK.test(clause)) return clause.length <= 20 ? clause : clause.slice(0, 20);
  const words = clause.split(/\s+/);
  return words.length <= 12 ? clause : words.slice(0, 12).join(" ");
}

function pickCoord(routeCoords: [number, number][], frac: number): { lat: number; lon: number } {
  const c = routeCoords[Math.min(routeCoords.length - 1, Math.floor(frac * routeCoords.length))];
  return { lat: c[1], lon: c[0] };
}

function toNarration(item: KnowledgeItem, lang: Lang, hometown: string) {
  const text = localized(item.fact, lang);
  const cmp = hometown ? item.hometown[hometown]?.comparison : null;
  const elsewhere = cmp ? shortenLine(localized(cmp, lang)) : null;
  return {
    id: `demo-${item.id}`,
    itemId: item.id,
    title: localized(item.title, lang),
    text,
    lang,
    sources: item.sources,
    confidence: item.confidence,
    category: item.category,
    contrast: elsewhere ? { here: shortenLine(localized(item.title, lang)), elsewhere } : null,
  };
}

// Pure builder (no browser APIs): easy to test, easy to re-run.
export function buildSeedData({ items, routes, lang, hometown, now, walks = DEMO_PAST_WALKS }: SeedInput): SeedData {
  const byId = new Map(items.map((i) => [i.id, i]));
  const discoveries: SeedDiscovery[] = [];
  const records: WalkRecord[] = [];
  for (const def of walks) {
    const coords = routes[def.route];
    if (!coords?.length) continue;
    const day = new Date(now);
    day.setDate(day.getDate() - def.daysAgo);
    day.setHours(def.start[0], def.start[1], 0, 0);
    const startedAt = day.getTime();
    const ids: string[] = [];
    def.itemIds.forEach((itemId, i) => {
      const item = byId.get(itemId);
      if (!item) return;
      const { lat, lon } = pickCoord(coords, (i + 1) / (def.itemIds.length + 1));
      const id = `${def.id}-${itemId}`;
      discoveries.push({
        id,
        narration: toNarration(item, lang, hometown),
        origin: "guide",
        at: startedAt + (4 + i * def.gapMin) * MIN,
        lat,
        lon,
        walkId: def.id,
      });
      ids.push(id);
    });
    const path = thinPath(coords.map(([lon, lat]): LatLon => [lat, lon]));
    records.push({
      id: def.id,
      startedAt,
      endedAt: startedAt + (8 + def.itemIds.length * def.gapMin) * MIN,
      areaName: def.areaName,
      distanceM: Math.round(pathDistanceM(path)),
      path: path.map(([lat, lon]) => [lat, lon] as [number, number]),
      discoveryIds: ids,
      simulated: true,
      mode: def.mode,
      destination: def.destination ? { name: localized(def.destination.name, lang), lat: def.destination.lat, lon: def.destination.lon } : null,
    });
  }
  return { discoveries, walks: records };
}

// Loads the real knowledge base + routes (code-split, only on demand) and
// merges the sample walks into the notebook. Returns the number of seeded
// discoveries. Re-running replaces the previous sample, never duplicates it.
export async function fillNotebookWithSampleWalk(opts: { lang: Lang; hometown: string }): Promise<number> {
  const [{ default: kb }, { default: routes }] = await Promise.all([
    import("@data/knowledge/taipei.json"),
    import("@data/demo/past-walk-routes.json"),
  ]);
  removeSampleWalks();
  const data = buildSeedData({
    items: kb as KnowledgeItem[],
    routes: routes as unknown as Record<string, [number, number][]>,
    lang: opts.lang,
    hometown: opts.hometown,
    now: Date.now(),
  });
  const seededIds = new Set(data.discoveries.map((d) => d.id));
  const seededWalkIds = new Set(data.walks.map((w) => w.id));
  writeStored(KEYS.discoveries, [...data.discoveries, ...readDiscoveries().filter((d) => !seededIds.has(d.id))]);
  writeStored(KEYS.walks, [...data.walks, ...readWalks().filter((w) => !seededWalkIds.has(w.id))]);
  return data.discoveries.length;
}

// The sample walks belong to the simulated entry: leaving it removes them.
export function removeSampleWalks(): void {
  const isSample = (id: string) => id.startsWith("demo-");
  writeStored(KEYS.discoveries, readDiscoveries().filter((d) => !isSample(d.id)));
  writeStored(KEYS.walks, readWalks().filter((w) => !isSample(w.id)));
}

// Every simulated walk starts from the same notebook: drop earlier replays
// (and the stories heard on them), then lay the sample walks down again with
// fresh relative dates. Real walks are never touched.
export function resetSimulatedNotebook(opts: { lang: Lang; hometown: string }): void {
  const walks = readWalks();
  const gone = new Set(walks.filter((w) => w.simulated && !w.id.startsWith("demo-")).map((w) => w.id));
  if (gone.size) {
    const keep = (d: Discovery) => !d.walkId || !gone.has(d.walkId);
    writeStored(KEYS.walks, walks.filter((w) => !gone.has(w.id)));
    writeStored(KEYS.discoveries, readDiscoveries().filter(keep));
    writeStored(KEYS.heard, readStored<Discovery[]>(KEYS.heard, [], migrateDiscoveries).filter(keep));
  }
  void fillNotebookWithSampleWalk(opts).catch(() => 0);
}
