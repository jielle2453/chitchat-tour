import { describe, expect, it } from "vitest";
import type { GeoFix, KnowledgeItem, NearbyPoi } from "@/lib/types";
import { isSamePlace, normalizePoiName, poiWorthResearching, rankOfPoi, poiCoveredByKb, selectAheadPois, selectRoutePois } from "./useDiscover";

const fix: GeoFix = { lat: 25.033, lon: 121.53, accuracy: 5, heading: 90, speed: 1.2, timestamp: 0 };

// ~1 m of longitude at this latitude ≈ 0.0000099 deg; east = bearing 90.
const east = (m: number, over: Partial<NearbyPoi> = {}): NearbyPoi => ({
  id: `node/${m}`,
  kind: "other",
  name: `Place ${m}`,
  lat: fix.lat,
  lon: fix.lon + m * 0.0000099,
  tags: { name: `Place ${m}`, tourism: "attraction" },
  distanceM: m,
  bearingDeg: 90,
  ...over,
});

const shopItem = {
  id: "convenience-store-density",
  layer: "point",
  trigger: { osm: ["shop=convenience"] },
} as unknown as KnowledgeItem;

describe("poiCoveredByKb", () => {
  it("matches KB point items and ignores the rest", () => {
    const store: NearbyPoi = { ...east(100), kind: "convenience", tags: { shop: "convenience" } };
    expect(poiCoveredByKb(store, [shopItem])?.id).toBe("convenience-store-density");
    expect(poiCoveredByKb(east(100), [shopItem])).toBeNull();
    expect(poiCoveredByKb(store, [])).toBeNull();
  });
});

describe("selectAheadPois", () => {
  const covered = () => false;
  const none = new Set<string>();
  it("picks named POIs ahead within 60–250 m, up to 2", () => {
    const pois = [east(100), east(150), east(200)];
    const got = selectAheadPois({ pois, fix, covered, researchedIds: none });
    expect(got.map((p) => p.id)).toEqual(["node/100", "node/150"]);
  });
  it("skips unnamed, too-close, too-far, behind and covered POIs", () => {
    const pois = [
      { ...east(100), name: undefined, brand: undefined },
      east(30),
      east(400),
      { ...east(120), bearingDeg: 270 },
      { ...east(130), id: "node/covered" },
    ];
    const got = selectAheadPois({ pois, fix, covered: (p) => p.id === "node/covered", researchedIds: none });
    expect(got).toEqual([]);
  });
  it("skips already-researched POIs and prefers temples over shops", () => {
    const pois = [
      { ...east(100), kind: "other" as const, name: "Bakery", tags: { shop: "bakery", name: "Bakery" } },
      { ...east(110), kind: "place_of_worship" as const, name: "Temple" },
      east(120),
    ];
    const got = selectAheadPois({ pois, fix, covered, researchedIds: new Set(["node/120"]) });
    expect(got.map((p) => p.id)).toEqual(["node/110", "node/100"]);
  });
  it("accepts any bearing when the walker is standing still", () => {
    const still = { ...fix, heading: null };
    const got = selectAheadPois({ pois: [{ ...east(120), bearingDeg: 270 }], fix: still, covered, researchedIds: none });
    expect(got).toHaveLength(1);
  });
  it("excludes bus stops and other transit infrastructure", () => {
    const busKind = { ...east(100), kind: "bus_stop" as const, name: "Jinhua Building" };
    const busTag = { ...east(110), kind: "other" as const, name: "Jinhua Building", tags: { name: "Jinhua Building", highway: "bus_stop" } };
    const signals = { ...east(120), kind: "traffic_signals" as const, name: "Signals" };
    const got = selectAheadPois({ pois: [busKind, busTag, signals, east(130)], fix, covered, researchedIds: none });
    expect(got.map((p) => p.id)).toEqual(["node/130"]);
  });
  it("dedupes the same place researched under a nearby duplicate", () => {
    const first = { ...east(100), id: "node/1", name: "Jinhua Building" };
    const dup = { ...east(104), id: "way/2", name: "Jinhua Building" };
    const got = selectAheadPois({ pois: [dup, east(150)], fix, covered, researchedIds: none, nearResearched: [first] });
    expect(got.map((p) => p.id)).toEqual(["node/150"]);
  });
});

describe("selectRoutePois", () => {
  const corridor: [number, number][] = [
    [121.529, 25.033],
    [121.534, 25.033],
  ];
  const covered = () => false;
  const none = new Set<string>();
  it("picks in-corridor POIs ahead of the walker, ordered along the route", () => {
    const pois = [east(200), east(100), east(400)];
    const got = selectRoutePois({ pois, fix, corridor, covered, researchedIds: none });
    expect(got.map((p) => p.id)).toEqual(["node/100", "node/200"]);
  });
  it("ignores the heading cone but drops behind and off-corridor POIs", () => {
    const behind = { ...east(50), id: "node/b", lat: 25.033, lon: 121.5295 };
    const side = { ...east(120), id: "node/s", lat: 25.0345 };
    const north = { ...fix, heading: 0 };
    const got = selectRoutePois({ pois: [behind, side, east(120)], fix: north, corridor, covered, researchedIds: none });
    expect(got.map((p) => p.id)).toEqual(["node/120"]);
  });
});

describe("poiWorthResearching", () => {
  const base = (over: Partial<NearbyPoi> = {}): NearbyPoi => ({
    id: "node/1",
    kind: "other",
    name: "Some Temple",
    lat: 25.033,
    lon: 121.53,
    tags: { name: "Some Temple", amenity: "place_of_worship" },
    distanceM: 100,
    bearingDeg: 90,
    ...over,
  });
  it("rejects bus stops, platforms and generic names", () => {
    expect(poiWorthResearching(base({ kind: "bus_stop" }))).toBe(false);
    expect(poiWorthResearching(base({ kind: "traffic_signals" }))).toBe(false);
    expect(poiWorthResearching(base({ tags: { highway: "bus_stop", name: "Stop" } }))).toBe(false);
    expect(poiWorthResearching(base({ tags: { public_transport: "platform", name: "Stop" } }))).toBe(false);
    expect(poiWorthResearching(base({ name: "Jinhua Building (bus_stop)" }))).toBe(false);
    expect(poiWorthResearching(base({ name: "12" }))).toBe(false);
    expect(poiWorthResearching(base({ name: undefined, brand: undefined }))).toBe(false);
  });
  it("accepts temples, markets and named shops", () => {
    expect(poiWorthResearching(base())).toBe(true);
    expect(poiWorthResearching(base({ kind: "marketplace", name: "Morning Market" }))).toBe(true);
    expect(poiWorthResearching(base({ name: "Bakery", tags: { shop: "bakery", name: "Bakery" } }))).toBe(true);
  });
});

describe("rankOfPoi", () => {
  const rank = (over: Partial<NearbyPoi>): number =>
    rankOfPoi({ id: "n", kind: "other", lat: 25.033, lon: 121.53, tags: {}, ...over });
  it("prefers worship and markets over ordinary shops", () => {
    expect(rank({ kind: "place_of_worship", name: "T" })).toBeGreaterThan(rank({ name: "Bakery", tags: { shop: "bakery" } }));
    expect(rank({ kind: "marketplace", name: "M" })).toBeGreaterThan(rank({ name: "Park", tags: { leisure: "park" } }));
  });
  it("boosts historic, museum and school tags", () => {
    expect(rank({ name: "H", tags: { historic: "memorial", name: "H" } })).toBeGreaterThan(rank({ name: "P" }));
    expect(rank({ name: "M", tags: { tourism: "museum", name: "M" } })).toBeGreaterThan(rank({ name: "P" }));
  });
});

describe("isSamePlace", () => {
  const at = (lon: number, over: Partial<NearbyPoi> = {}): NearbyPoi => ({
    id: "node/1",
    kind: "other",
    name: "Jinhua Building",
    lat: 25.033,
    lon,
    tags: {},
    distanceM: 0,
    bearingDeg: 0,
    ...over,
  });
  it("matches parenthetical variants within 60 m", () => {
    expect(normalizePoiName("Jinhua Building (bus_stop)")).toBe("jinhua building");
    expect(isSamePlace(at(121.53), at(121.5304, { id: "way/2", name: "Jinhua Building (bus_stop)" }))).toBe(true);
  });
  it("rejects different names and far-apart duplicates", () => {
    expect(isSamePlace(at(121.53), at(121.5301, { id: "n2", name: "Other Hall" }))).toBe(false);
    expect(isSamePlace(at(121.53), at(121.54, { id: "n3" }))).toBe(false);
  });
});
