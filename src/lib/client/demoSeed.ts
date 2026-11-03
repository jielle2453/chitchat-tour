// Demo seeding for the notebook: writes two realistic sample walks (a wander
// today + a destination walk to Dongmen Market yesterday) into the same client
// storage the walk uses, so the Notebook tab can be browsed without walking
// first. Titles, facts and sources come from the real knowledge base; the
// walked routes are the Yongkang / Jinhua demo routes. Every id has a
// corresponding public/illustrations/<itemId>.webp.
"use client";
import type { Discovery, KnowledgeItem, Lang, RouteDef, WalkMode, WalkRecord } from "@/lib/types";
import { localized } from "./i18n";
import { readDiscoveries, readWalks, writeStored } from "./storage";
import { KEYS } from "./storageFormat";
import { pathDistanceM, thinPath, type LatLon } from "./walkPath";

// Six discoveries along today's wander, four along yesterday's destination walk.
export const DEMO_WANDER_IDS = [
  "garbage-truck-why-music",
  "convenience-store-density",
  "mrt-no-eating",
  "pedestrian-flashing-green-rule",
  "arcade-qilou-origin",
  "youbike-origin",
] as const;

export const DEMO_DEST_IDS = [
  "breakfast-hot-food",
  "mrt-fare-gate-yellow-line",
  "two-stage-left-turn-origin",
  "rooftop-water-tank",
] as const;

export const DEMO_DEST_NAME: Record<Lang, string> = { en: "Dongmen Market", "zh-TW": "東門市場", ja: "東門市場", ko: "Dongmen Market" };

export interface SeedInput {
  items: KnowledgeItem[];
  routeCoords: [number, number][]; // [lon, lat], walking order (wander)
  destRouteCoords?: [number, number][]; // [lon, lat], walking order (destination)
  lang: Lang;
  hometown: string;
  now: number;
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

// Never before local midnight today: spread over the past half hour, clamped
// to 00:05+. Just after midnight everything lands on `now`.
export function seedTimes(now: number, n: number): number[] {
  const start = new Date(now);
  start.setHours(0, 5, 0, 0);
  const end = now - 5 * MIN;
  const earliest = Math.max(start.getTime(), end - 30 * MIN);
  if (earliest >= end || n < 2) return Array(n).fill(now);
  return Array.from({ length: n }, (_, i) => earliest + ((end - earliest) * i) / (n - 1));
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

function buildWalk(
  id: string,
  routeCoords: [number, number][],
  frac: [number, number],
  firstAt: number,
  lastAt: number,
  discoveryIds: string[],
  opts: { areaName: string | null; mode: WalkMode; destination?: { name: string; lat: number; lon: number } | null },
): WalkRecord {
  const slice = routeCoords.slice(Math.floor(frac[0] * routeCoords.length), Math.ceil(frac[1] * routeCoords.length));
  const path = thinPath(slice.map(([lon, lat]): LatLon => [lat, lon]));
  return {
    id,
    startedAt: firstAt - 8 * MIN,
    endedAt: lastAt + 4 * MIN,
    areaName: opts.areaName,
    distanceM: Math.round(pathDistanceM(path)),
    path: path.map(([lat, lon]) => [lat, lon] as [number, number]),
    discoveryIds,
    simulated: true,
    mode: opts.mode,
    destination: opts.destination ?? null,
  };
}

// Pure builder (no browser APIs): easy to test, easy to re-run.
export function buildSeedData({ items, routeCoords, destRouteCoords, lang, hometown, now }: SeedInput): SeedData {
  const byId = new Map(items.map((i) => [i.id, i]));
  const coords: [number, number][] = routeCoords.length ? routeCoords : [[121.5299, 25.0338]];
  const destCoords: [number, number][] = destRouteCoords?.length ? destRouteCoords : coords;
  const discoveries: SeedDiscovery[] = [];
  const mk = (itemId: string, at: number, walkId: string, frac: number, tag: string, on: [number, number][]): void => {
    const item = byId.get(itemId);
    if (!item) return;
    const { lat, lon } = pickCoord(on, frac);
    discoveries.push({
      id: `demo-${itemId}-${tag}`,
      narration: toNarration(item, lang, hometown),
      origin: "guide",
      at,
      lat,
      lon,
      walkId,
    });
  };

  // Walk 1 (today): an open wander along the full Yongkang loop.
  const wanderIds: string[] = [];
  const wanderAts = seedTimes(now, DEMO_WANDER_IDS.length);
  DEMO_WANDER_IDS.forEach((itemId, i) => {
    mk(itemId, wanderAts[i], "demo-walk-wander", (i + 1) / (DEMO_WANDER_IDS.length + 1), `w${i}`, coords);
    wanderIds.push(`demo-${itemId}-w${i}`);
  });

  // Walk 2 (yesterday afternoon, so the date never shifts): a destination walk
  // to Dongmen Market along the Jinhua route.
  const destIds: string[] = [];
  const destDay = new Date(now);
  destDay.setDate(destDay.getDate() - 1);
  destDay.setHours(14, 5, 0, 0);
  const destFirst = destDay.getTime();
  const destAts = DEMO_DEST_IDS.map((_, i) => destFirst + i * 4 * MIN);
  DEMO_DEST_IDS.forEach((itemId, i) => {
    mk(itemId, destAts[i], "demo-walk-dest", (i + 1) / (DEMO_DEST_IDS.length + 1), `d${i}`, destCoords);
    destIds.push(`demo-${itemId}-d${i}`);
  });

  const kept = new Set(discoveries.map((d) => d.id));
  const destName = DEMO_DEST_NAME[lang] ?? DEMO_DEST_NAME.en;
  const walks = [
    buildWalk("demo-walk-wander", coords, [0, 1], wanderAts[0], wanderAts[wanderAts.length - 1], wanderIds.filter((id) => kept.has(id)), {
      areaName: "Yongkang Street",
      mode: "wander",
    }),
    buildWalk(
      "demo-walk-dest",
      destCoords,
      [0, 1],
      destAts[0],
      destAts[destAts.length - 1],
      destIds.filter((id) => kept.has(id)),
      {
        areaName: "Yongkang Street",
        mode: "destination",
        destination: { name: destName, lat: 25.0348, lon: 121.5268 },
      },
    ),
  ];
  return { discoveries, walks };
}

// Loads the real knowledge base + routes (code-split, only on demand) and
// merges the sample walks into the notebook. Returns the number of seeded
// discoveries. Re-running replaces the previous sample, never duplicates it.
export async function fillNotebookWithSampleWalk(opts: { lang: Lang; hometown: string }): Promise<number> {
  const [{ default: kb }, { default: route }, { default: destRoute }] = await Promise.all([
    import("@data/knowledge/taipei.json"),
    import("@data/routes/yongkang.json"),
    import("@data/routes/jinhua.json"),
  ]);
  const data = buildSeedData({
    items: kb as KnowledgeItem[],
    routeCoords: (route as RouteDef).coordinates,
    destRouteCoords: (destRoute as RouteDef).coordinates,
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
