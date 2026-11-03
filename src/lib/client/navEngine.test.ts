// Local stubs only: these stand in for the geo module's navigation helper
// until it lands. The shapes mirror src/lib/types.ts.
import { describe, expect, it, vi } from "vitest";
import type { GeoFix, NearbyPoi, RouteStep, WalkRoute } from "@/lib/types";
import {
  ARRIVE_M,
  arrivalText,
  detourText,
  displayName,
  etaMinutes,
  fetchGeocode,
  fetchNearby,
  fetchWalkRoute,
  fetchWalkRouteOptions,
  PICK_PLACES_LIMIT,
  PICK_PLACES_RADIUS_M,
  selectPickPlaces,
  TakeLatest,
  isDetourWorthy,
  isOffRoute,
  navCue,
  poisAlongRoute,
  progressOnRoute,
  relativeDir,
  routeToRouteDef,
  selectDetourCandidate,
  signedDiff,
  worthVisiting,
} from "./navEngine";

// Straight route east along the equator-ish: 1 deg lon ≈ 101.9 m at lat 25.
const fix = (lon: number, lat = 25.033, heading: number | null = 90): GeoFix => ({
  lat,
  lon,
  accuracy: 5,
  heading,
  speed: 1.2,
  timestamp: 0,
});

function straightRoute(): WalkRoute {
  const lon0 = 121.53;
  const step = 0.001; // ~101.9 m per step
  const coords: [number, number][] = [0, 1, 2, 3, 4].map((i) => [lon0 + i * step, 25.033]);
  const segLen = 100.86; // ~1 deg lon in metres at lat 25
  const steps: RouteStep[] = [
    { type: "depart", location: coords[0], name: "", distanceM: segLen * 2 },
    { type: "turn", modifier: "right", location: coords[2], name: "Yongkang St", distanceM: segLen * 2 },
    { type: "arrive", location: coords[4], name: "", distanceM: 0 },
  ];
  return { coordinates: coords, distanceM: segLen * 4, durationS: 300, steps };
}

const poi = (over: Partial<NearbyPoi> = {}): NearbyPoi => ({
  id: "node/1",
  kind: "other",
  name: "Some Place",
  lat: 25.033,
  lon: 121.53,
  tags: {},
  distanceM: 100,
  bearingDeg: 90,
  ...over,
});

describe("progressOnRoute", () => {
  it("tracks along/remaining and the next maneuver", () => {
    const route = straightRoute();
    const p0 = progressOnRoute(route, fix(121.53));
    expect(p0.distanceAlongM).toBeLessThan(2);
    expect(p0.remainingM).toBeCloseTo(100.86 * 4, 0);
    expect(p0.offRouteM).toBeLessThan(2);
    expect(p0.nextStepIndex).toBe(1);
    expect(p0.distanceToNextStepM).toBeCloseTo(100.86 * 2, 0);
    // past the turn: next is arrival, ~150 m out
    const p1 = progressOnRoute(route, fix(121.5325));
    expect(p1.nextStepIndex).toBe(2);
    expect(p1.distanceToNextStepM).toBeGreaterThan(100);
    expect(p1.distanceToNextStepM).toBeLessThan(200);
  });
  it("flags off-route fixes", () => {
    const p = progressOnRoute(straightRoute(), fix(121.531, 25.034));
    expect(isOffRoute(p)).toBe(true);
    expect(isOffRoute(p, 500)).toBe(false);
  });
  it("reaches zero remaining at the end", () => {
    const p = progressOnRoute(straightRoute(), fix(121.534));
    expect(p.remainingM).toBeLessThan(2);
    expect(p.remainingM).toBeLessThan(ARRIVE_M);
  });
});

describe("navCue", () => {
  const at: [number, number] = [121.53, 25.033];
  it("speaks turns with street names, stays quiet on plain straights", () => {
    expect(navCue({ type: "turn", modifier: "right", location: at, name: "Yongkang St", distanceM: 10 }, "zh-TW")).toBe(
      "前面右轉，進Yongkang St。",
    );
    expect(navCue({ type: "turn", modifier: "left", location: at, name: "Yongkang St", distanceM: 10 }, "en")).toBe(
      "Turn left ahead onto Yongkang St.",
    );
    expect(navCue({ type: "turn", modifier: "left", location: at, name: "", distanceM: 10 }, "ja")).toBe("この先を左です。");
    expect(navCue({ type: "depart", location: at, name: "", distanceM: 10 }, "en")).toBe("Start walking.");
    expect(navCue({ type: "continue", modifier: "straight", location: at, name: "Main St", distanceM: 10 }, "en")).toBe("");
    expect(navCue({ type: "turn", location: at, name: "Main St", distanceM: 10 }, "en")).toBe("Turn ahead onto Main St.");
  });
  it("maps slight/uturn/arrive/end-of-road", () => {
    expect(navCue({ type: "turn", modifier: "slight left", location: at, name: "", distanceM: 5 }, "zh-TW")).toBe("前面靠左。");
    expect(navCue({ type: "turn", modifier: "uturn", location: at, name: "", distanceM: 5 }, "en")).toBe("Make a U-turn.");
    expect(navCue({ type: "arrive", location: at, name: "", distanceM: 0 }, "zh-TW")).toBe("到了。");
    expect(navCue({ type: "end of road", modifier: "right", location: at, name: "Main St", distanceM: 5 }, "en")).toBe(
      "At the end of the road, turn right onto Main St.",
    );
  });
  it("arrival text names the place when known", () => {
    expect(arrivalText("東門市場", "zh-TW")).toBe("到了，東門市場。貼紙都收在筆記裡了。");
    expect(arrivalText("Yongkang Park", "en")).toBe("We've arrived at Yongkang Park. Your stickers are in the notebook.");
    expect(arrivalText("永康公園", "ja")).toBe("永康公園に到着しました。ステッカーはノートに貼ってあります。");
    expect(arrivalText("", "en")).toBe("Arrived");
  });
});

describe("routeToRouteDef", () => {
  it("wraps the computed route for the simulated source", () => {
    const def = routeToRouteDef(straightRoute(), "Dongmen Market");
    expect(def.coordinates).toHaveLength(5);
    expect(def.name.en).toBe("Dongmen Market");
    expect(def.id).toBe("destination");
  });
});

describe("poisAlongRoute", () => {
  it("keeps in-corridor POIs ordered along the route", () => {
    const route = straightRoute();
    const near = poi({ id: "a", lat: 25.03305, lon: 121.533 });
    const far = poi({ id: "b", lat: 25.036, lon: 121.531 });
    const start = poi({ id: "c", lat: 25.03302, lon: 121.5302 });
    expect(poisAlongRoute(route, [near, far, start], 60).map((p) => p.id)).toEqual(["c", "a"]);
  });
});

describe("detour direction", () => {
  it("classifies left/right/behind, null when ahead", () => {
    expect(relativeDir(90, 90)).toBeNull();
    expect(relativeDir(0, 90)).toBe("left");
    expect(relativeDir(180, 90)).toBe("right");
    expect(relativeDir(270, 90)).toBe("behind");
    expect(signedDiff(0, 90)).toBe(-90);
  });
  it("detour text reads naturally", () => {
    expect(detourText("老廟", "left", "zh-TW")).toBe("左手邊有老廟，要不要繞過去看看？");
    expect(detourText("Temple", "behind", "en")).toContain("behind you");
  });
});

describe("isDetourWorthy", () => {
  it("accepts temples, markets, historic, parks, museums", () => {
    expect(isDetourWorthy({ kind: "place_of_worship", tags: {} })).toBe(true);
    expect(isDetourWorthy({ kind: "marketplace", tags: {} })).toBe(true);
    expect(isDetourWorthy({ kind: "other", tags: { historic: "memorial" } })).toBe(true);
    expect(isDetourWorthy({ kind: "other", tags: { leisure: "park" } })).toBe(true);
    expect(isDetourWorthy({ kind: "other", tags: { tourism: "museum" } })).toBe(true);
    expect(isDetourWorthy({ kind: "convenience", tags: { shop: "convenience" } })).toBe(false);
    expect(isDetourWorthy({ kind: "other", tags: { shop: "bakery" } })).toBe(false);
  });
});

describe("selectDetourCandidate", () => {
  const temple = (over: Partial<NearbyPoi> = {}) =>
    poi({ id: "t", kind: "place_of_worship", name: "Temple", bearingDeg: 0, distanceM: 120, ...over });
  it("picks a worthy off-heading POI in range", () => {
    const got = selectDetourCandidate([temple()], fix(121.53), new Set(["t"]), new Set());
    expect(got?.poi.id).toBe("t");
    expect(got?.dir).toBe("left");
  });
  it("skips ahead, too-close, unready, skipped and heading-less cases", () => {
    const ahead = temple({ id: "a", bearingDeg: 100 });
    const close = temple({ id: "c", bearingDeg: 0, distanceM: 30 });
    expect(selectDetourCandidate([ahead, close], fix(121.53), new Set(["a", "c"]), new Set())).toBeNull();
    expect(selectDetourCandidate([temple()], fix(121.53), new Set(), new Set(["t"]))).toBeNull();
    expect(selectDetourCandidate([temple()], fix(121.53), new Set(["t"]), new Set())).not.toBeNull();
    expect(selectDetourCandidate([temple()], fix(121.53, 25.033, null), new Set(["t"]), new Set())).toBeNull();
    expect(selectDetourCandidate([poi({ id: "s", kind: "convenience", bearingDeg: 0, distanceM: 120 })], fix(121.53), new Set(["s"]), new Set())).toBeNull();
  });
  it("prefers worship/markets over parks at equal footing", () => {
    const park = poi({ id: "p", kind: "other", name: "Park", tags: { leisure: "park" }, bearingDeg: 180, distanceM: 80 });
    const got = selectDetourCandidate([park, temple()], fix(121.53), new Set(["p", "t"]), new Set());
    expect(got?.poi.id).toBe("t");
  });
});

describe("worthVisiting", () => {
  it("accepts named markets, temples, parks, museums", () => {
    expect(worthVisiting({ kind: "marketplace", name: "Morning Market", tags: {} })).toBe(true);
    expect(worthVisiting({ kind: "place_of_worship", name: "Temple", tags: {} })).toBe(true);
    expect(worthVisiting({ kind: "other", name: "Park", tags: { leisure: "park" } })).toBe(true);
    expect(worthVisiting({ kind: "other", name: "Museum", tags: { tourism: "museum" } })).toBe(true);
    expect(worthVisiting({ kind: "other", tags: {} })).toBe(false);
    expect(worthVisiting({ kind: "convenience", name: "7-Eleven", tags: { shop: "convenience" } })).toBe(false);
  });
});

describe("etaMinutes", () => {
  it("scales route duration by remaining share", () => {
    expect(etaMinutes({ durationS: 600, distanceM: 800 }, 800)).toBe(10);
    expect(etaMinutes({ durationS: 600, distanceM: 800 }, 80)).toBe(1);
  });
});

function mockFetch(body: unknown, ok = true, status = 200) {
  const g = globalThis as unknown as { fetch: unknown };
  g.fetch = vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(body) });
}

describe("api wrappers", () => {
  it("fetchGeocode returns results, throws friendly errors", async () => {
    mockFetch({ results: [{ id: "1", name: "A", label: "L", lat: 25, lon: 121 }] });
    expect(await fetchGeocode("market", fix(121.5), "en")).toHaveLength(1);
    mockFetch({ error: "Nope" }, false, 502);
    await expect(fetchGeocode("market", null, "en")).rejects.toThrow("Nope");
  });
  it("fetchNearby filters bad coords", async () => {
    mockFetch({ pois: [poi(), { ...poi({ id: "bad" }), lat: NaN }] });
    expect((await fetchNearby(25, 121)).map((p) => p.id)).toEqual(["node/1"]);
  });
  it("fetchWalkRoute validates the shape", async () => {
    mockFetch({ route: straightRoute() });
    expect((await fetchWalkRoute({ lat: 25, lon: 121 }, { lat: 25.01, lon: 121.01 }, "en")).steps).toHaveLength(3);
    mockFetch({ route: { coordinates: [] } });
    await expect(fetchWalkRoute({ lat: 25, lon: 121 }, { lat: 25.01, lon: 121.01 }, "en")).rejects.toThrow();
  });
});

describe("displayName", () => {
  const stop = poi({
    id: "stop",
    kind: "bus_stop",
    name: "Xinyi and Xinsheng Intersection",
    tags: { name: "信義新生路口", "name:en": "Xinyi and Xinsheng Intersection", "name:ja": "信義新生路" },
  });
  it("prefers the name tag for the UI language", () => {
    expect(displayName(stop, "zh-TW")).toBe("信義新生路口");
    expect(displayName(stop, "ja")).toBe("信義新生路");
    expect(displayName(stop, "en")).toBe("Xinyi and Xinsheng Intersection");
  });
  it("falls back through stored name, local tag and brand", () => {
    expect(displayName(poi({ name: "7-Eleven", brand: "7-Eleven", tags: { shop: "convenience" } }), "zh-TW")).toBe("7-Eleven");
    expect(displayName(poi({ name: undefined, brand: undefined, tags: { name: "東門市場" } }), "en")).toBe("東門市場");
    expect(displayName(poi({ name: undefined, brand: "FamilyMart", tags: {} }), "zh-TW")).toBe("FamilyMart");
  });
});

describe("selectPickPlaces", () => {
  const near = (over: Partial<NearbyPoi> = {}): NearbyPoi => poi({ distanceM: 15, ...over });
  it("keeps the closest named places within the radius, at most the limit", () => {
    const pois = [
      near({ id: "far", distanceM: 61 }),
      near({ id: "a", distanceM: 40 }),
      near({ id: "b", distanceM: 10 }),
      near({ id: "c", distanceM: 25 }),
      near({ id: "d", distanceM: 5 }),
      near({ id: "noname", name: undefined, brand: undefined, distanceM: 2 }),
      near({ id: "blank", name: "  ", distanceM: 3 }),
      near({ id: "nan", distanceM: NaN }),
    ];
    expect(selectPickPlaces(pois).map((p) => p.id)).toEqual(["d", "b", "c"]);
    expect(PICK_PLACES_LIMIT).toBe(3);
    expect(PICK_PLACES_RADIUS_M).toBe(60);
  });
  it("falls back to brand names and honours custom radius/limit", () => {
    const brand = near({ id: "brand", name: undefined, brand: "FamilyMart", distanceM: 50 });
    expect(selectPickPlaces([brand]).map((p) => p.id)).toEqual(["brand"]);
    expect(selectPickPlaces([brand], 40)).toEqual([]);
    expect(selectPickPlaces([near({ id: "x", distanceM: 5 })], 60, 0)).toEqual([]);
  });
  it("excludes signals, crossings, bus stops and bike docks", () => {
    const pois = [
      near({ id: "signal", kind: "traffic_signals", distanceM: 5 }),
      near({ id: "live-signal", kind: "other", distanceM: 6, tags: { highway: "traffic_signals", name: "Signals" } }),
      near({ id: "crossing", kind: "other", distanceM: 7, tags: { highway: "crossing", name: "Crossing" } }),
      near({ id: "stop", kind: "bus_stop", distanceM: 8 }),
      near({ id: "dock", kind: "bicycle_rental", distanceM: 9 }),
      near({ id: "shop", distanceM: 10 }),
    ];
    expect(selectPickPlaces(pois).map((p) => p.id)).toEqual(["shop"]);
  });
});

describe("TakeLatest", () => {
  it("only the newest token is current; reset invalidates all", () => {
    const guard = new TakeLatest();
    const first = guard.issue();
    const second = guard.issue();
    expect(guard.isLatest(first)).toBe(false);
    expect(guard.isLatest(second)).toBe(true);
    guard.reset();
    expect(guard.isLatest(second)).toBe(false);
    expect(guard.isLatest(guard.issue())).toBe(true);
  });
});

describe("fetchWalkRouteOptions", () => {
  it("asks for alternatives and maps fastest + hear-more", async () => {
    const fastest = straightRoute();
    const longer = { ...straightRoute(), distanceM: fastest.distanceM * 1.2 };
    let seenUrl = "";
    const g = globalThis as unknown as { fetch: unknown };
    g.fetch = vi.fn().mockImplementation((url: string) => {
      seenUrl = url;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ route: fastest, routes: [fastest, longer], stories: [1, 4] }) });
    });
    const opts = await fetchWalkRouteOptions({ lat: 25, lon: 121 }, { lat: 25.01, lon: 121.01 }, "en", "JP");
    expect(seenUrl).toContain("alternatives=1");
    expect(seenUrl).toContain("hometown=JP");
    expect(opts.fastest).toEqual(fastest);
    expect(opts.hearMore).toEqual(longer);
    expect(opts.stories).toEqual([1, 4]);
  });
  it("falls back to a single route without extras", async () => {
    mockFetch({ route: straightRoute() });
    const opts = await fetchWalkRouteOptions({ lat: 25, lon: 121 }, { lat: 25.01, lon: 121.01 }, "en");
    expect(opts.hearMore).toBeNull();
    expect(opts.routes).toHaveLength(1);
    expect(opts.stories).toEqual([0]);
  });
  it("rejects invalid shapes", async () => {
    mockFetch({ routes: [] });
    await expect(fetchWalkRouteOptions({ lat: 25, lon: 121 }, { lat: 25.01, lon: 121.01 }, "en")).rejects.toThrow();
  });
});
