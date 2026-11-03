import { describe, expect, it } from "vitest";
import type { KnowledgeItem, Poi, WalkRoute } from "@/lib/types";
import {
  findStoryWaypoint,
  isStoryKind,
  poiMatchesTrigger,
  sameRoute,
  scoreRouteStories,
  selectHearMore,
  type ScoredRoute,
} from "./routeOptions";

const LAT = 25.033;

// Straight route heading east: ~101.9 m per 0.001 deg lon at this latitude.
function straightRoute(lon0 = 121.53, steps = 4, seg = 0.001): WalkRoute {
  const coords: [number, number][] = Array.from({ length: steps + 1 }, (_, i) => [lon0 + i * seg, LAT]);
  const segLen = 101.9 * seg * 1000;
  return {
    coordinates: coords,
    distanceM: segLen * steps,
    durationS: (segLen * steps) / 1.3,
    steps: [{ type: "arrive", location: coords[coords.length - 1], name: "", distanceM: 0 }],
  };
}

const poi = (over: Partial<Poi> = {}): Poi => ({
  id: "node/1",
  kind: "other",
  name: "Some Place",
  lat: LAT,
  lon: 121.531,
  tags: {},
  ...over,
});

function kbItem(over: Partial<KnowledgeItem> = {}): KnowledgeItem {
  return {
    id: "convenience-store-density",
    category: "shop",
    layer: "point",
    trigger: { osm: ["shop=convenience"] },
    title: { en: "Stores" },
    fact: { en: "Many stores." },
    sources: [{ url: "https://example.com", title: "Example" }],
    confidence: "high",
    disputed: false,
    caveats: null,
    hometown: {
      JP: { status: "different", comparison: null, sources: [] },
      US: { status: "absent", comparison: null, sources: [] },
    },
    ...over,
  };
}

describe("poiMatchesTrigger", () => {
  it("matches key=value against tags, bare words against tags and kind", () => {
    const shop = poi({ kind: "convenience", tags: { shop: "convenience" } });
    expect(poiMatchesTrigger(shop, ["shop=convenience"])).toBe(true);
    expect(poiMatchesTrigger(shop, ["shop=supermarket"])).toBe(false);
    expect(poiMatchesTrigger(shop, ["convenience"])).toBe(true);
    const signal = poi({ kind: "other", tags: { highway: "traffic_signals" } });
    expect(poiMatchesTrigger(signal, ["highway=traffic_signals"])).toBe(true);
    expect(poiMatchesTrigger(signal, ["highway=bus_stop"])).toBe(false);
    expect(poiMatchesTrigger(signal, ["shop=convenience"])).toBe(false);
    expect(poiMatchesTrigger(shop, [])).toBe(false);
  });
});

describe("isStoryKind", () => {
  it("accepts markets, temples, historic, parks, museums", () => {
    expect(isStoryKind({ kind: "marketplace", tags: {} })).toBe(true);
    expect(isStoryKind({ kind: "place_of_worship", tags: {} })).toBe(true);
    expect(isStoryKind({ kind: "other", tags: { historic: "memorial" } })).toBe(true);
    expect(isStoryKind({ kind: "other", tags: { leisure: "park" } })).toBe(true);
    expect(isStoryKind({ kind: "other", tags: { tourism: "museum" } })).toBe(true);
    expect(isStoryKind({ kind: "convenience", tags: { shop: "convenience" } })).toBe(false);
  });
});

describe("scoreRouteStories", () => {
  const route = straightRoute();
  const shop = (id = "shop", lon = 121.532) =>
    poi({ id, kind: "convenience", name: "7-Eleven", lat: LAT + 0.0002, lon, tags: { shop: "convenience" } });
  const temple = (id: string, lon = 121.533) =>
    poi({ id, kind: "place_of_worship", name: "Temple", lat: LAT - 0.0002, lon, tags: { amenity: "place_of_worship" } });
  it("weights novelty by hometown status", () => {
    const items = [kbItem()];
    // US = absent (3), JP = different (2), no hometown = 1 each.
    expect(scoreRouteStories(route, [shop()], items, "US")).toEqual({ score: 3, stories: 1 });
    expect(scoreRouteStories(route, [shop()], items, "JP")).toEqual({ score: 2, stories: 1 });
    expect(scoreRouteStories(route, [shop()], items)).toEqual({ score: 1, stories: 1 });
  });
  it("counts each distinct item once no matter how many POIs trigger it", () => {
    const items = [kbItem()];
    const got = scoreRouteStories(route, [shop("s1", 121.531), shop("s2", 121.533)], items, "US");
    // Two trigger POIs, one story — but the per-POI novelty score is kept.
    expect(got).toEqual({ score: 6, stories: 1 });
  });
  it("counts distinct items separately", () => {
    const market = kbItem({ id: "market-day", trigger: { osm: ["amenity=marketplace"] } });
    const pois = [shop(), poi({ id: "m", kind: "marketplace", name: "Market", lat: LAT - 0.0002, lon: 121.533, tags: { amenity: "marketplace" } })];
    expect(scoreRouteStories(route, pois, [kbItem(), market], "US").stories).toBe(2);
  });
  it("gives a bounded allowance for live-discovery places with no trigger", () => {
    const items = [kbItem()];
    expect(scoreRouteStories(route, [temple("t1")], items, "US")).toEqual({ score: 0.5, stories: 0 });
    expect(scoreRouteStories(route, [temple("t1"), temple("t2", 121.534)], items, "US").stories).toBe(1);
    const many = Array.from({ length: 7 }, (_, i) => temple(`t${i}`, 121.531 + i * 0.0005));
    expect(scoreRouteStories(route, many, items, "US").stories).toBe(3);
  });
  it("caps stories by walking time, about one per 40 seconds", () => {
    const market = kbItem({ id: "market-day", trigger: { osm: ["amenity=marketplace"] } });
    const shrine = kbItem({ id: "shrine-visit", trigger: { osm: ["religion=shinto"] } });
    const pois = [
      shop(),
      poi({ id: "m", kind: "marketplace", name: "Market", lat: LAT - 0.0002, lon: 121.532, tags: { amenity: "marketplace" } }),
      poi({ id: "s", kind: "place_of_worship", name: "Shrine", lat: LAT + 0.0002, lon: 121.533, tags: { religion: "shinto" } }),
    ];
    const short = { ...route, durationS: 50 };
    expect(scoreRouteStories(short, pois, [kbItem(), market, shrine], "US").stories).toBe(1);
    expect(scoreRouteStories({ ...route, durationS: 0 }, pois, [kbItem(), market, shrine], "US").stories).toBe(0);
    expect(scoreRouteStories(route, pois, [kbItem(), market, shrine], "US").stories).toBe(3);
  });
  it("ignores far-away, low-confidence, parent and sourceless items", () => {
    const far = poi({ id: "far", kind: "convenience", name: "Far", lat: LAT + 0.01, lon: 121.532, tags: { shop: "convenience" } });
    const items = [
      kbItem(),
      kbItem({ id: "low", confidence: "low" }),
      kbItem({ id: "facet", parent: "convenience-store-density" }),
      kbItem({ id: "nosrc", sources: [] }),
    ];
    expect(scoreRouteStories(route, [shop(), far], items, "US")).toEqual({ score: 3, stories: 1 });
  });
  it("scores zero when nothing story-worthy is near", () => {
    const boring = poi({ id: "b", kind: "other", name: "Pole", lat: LAT, lon: 121.531, tags: { man_made: "utility_pole" } });
    expect(scoreRouteStories(route, [boring], [kbItem()], "US")).toEqual({ score: 0, stories: 0 });
    expect(scoreRouteStories(route, [], [kbItem()], "US")).toEqual({ score: 0, stories: 0 });
  });
});

describe("selectHearMore", () => {
  const fastest: ScoredRoute = { route: straightRoute(), score: 1, stories: 1 };
  const cand = (stories: number, ratio: number, extraS: number, score?: number): ScoredRoute => {
    const r = straightRoute();
    return { route: { ...r, distanceM: fastest.route.distanceM * ratio, durationS: fastest.route.durationS + extraS }, score: score ?? stories, stories };
  };
  it("picks a candidate that is meaningfully better within budget", () => {
    expect(selectHearMore(fastest, [cand(3, 1.3, 300)])?.stories).toBe(3);
  });
  it("rejects routes that are too long, too slow, or barely better", () => {
    expect(selectHearMore(fastest, [cand(5, 1.41, 100)])).toBeNull(); // >40% longer
    expect(selectHearMore(fastest, [cand(5, 1.2, 481)])).toBeNull(); // +8 min over
    expect(selectHearMore(fastest, [cand(2, 1.1, 60)])).toBeNull(); // only 1 more place
    expect(selectHearMore(fastest, [])).toBeNull();
  });
  it("prefers the best score, then the shorter route", () => {
    const a = cand(4, 1.3, 300, 5);
    const b = cand(4, 1.2, 200, 8);
    expect(selectHearMore(fastest, [a, b])?.route.distanceM).toBe(b.route.distanceM);
  });
});

describe("sameRoute", () => {
  it("treats near-identical lengths as the same path", () => {
    const a = straightRoute();
    expect(sameRoute(a, straightRoute())).toBe(true);
    const longer = { ...a, distanceM: a.distanceM * 1.2 };
    expect(sameRoute(a, longer)).toBe(false);
    const otherShape = straightRoute(121.53, 6);
    expect(sameRoute(a, otherShape)).toBe(false);
  });
});

describe("findStoryWaypoint", () => {
  const from = { lat: LAT, lon: 121.53 };
  const to = { lat: LAT, lon: 121.534 };
  const fastest = straightRoute();
  const cluster = (id: string, dLat: number, dLon: number) =>
    poi({ id, kind: "convenience", name: `Shop ${id}`, lat: LAT + dLat, lon: 121.532 + dLon, tags: { shop: "convenience" } });
  it("returns a cluster POI off the fastest line", () => {
    const pois = [cluster("a", 0.002, 0), cluster("b", 0.0022, 0.0003), cluster("on", 0, 0.0005)];
    const wp = findStoryWaypoint(pois, [kbItem()], fastest, from, to);
    expect(wp).not.toBeNull();
    expect(["a", "b"]).toContain(pois.find((p) => p.lat === wp?.lat && p.lon === wp?.lon)?.id);
  });
  it("returns null without a cluster", () => {
    expect(findStoryWaypoint([cluster("solo", 0.002, 0)], [kbItem()], fastest, from, to)).toBeNull();
    expect(findStoryWaypoint([cluster("on1", 0, 0), cluster("on2", 0, 0.0005)], [kbItem()], fastest, from, to)).toBeNull();
    expect(findStoryWaypoint([], [kbItem()], fastest, from, to)).toBeNull();
  });
});
