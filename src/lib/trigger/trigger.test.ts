import { describe, expect, it } from "vitest";
import type { GeoFix, KnowledgeItem, NearbyPoi, UserProfile, WalkState } from "@/lib/types";
import { DEFAULT_TRIGGER_CONFIG, emptyWalkState, rankCandidates, shouldSpeak } from "./index";

// 2026-01-01 12:00 Taipei = 04:00 UTC
const NOON = Date.UTC(2026, 0, 1, 4, 0, 0);
const LATE = Date.UTC(2026, 0, 1, 15, 0, 0); // 23:00 Taipei
const EVENING = Date.UTC(2026, 0, 1, 10, 0, 0); // 18:00 Taipei

const fix = (o: Partial<GeoFix> = {}): GeoFix => ({
  lat: 25.03, lon: 121.53, accuracy: 10, heading: 0, speed: 1.2, timestamp: NOON, ...o,
});
const jp: UserProfile = { hometown: "JP", lang: "en" };
const us: UserProfile = { hometown: "US", lang: "en" };
const src = [{ url: "https://example.org/a", title: "A" }];
const cmp = (status: "same" | "different" | "absent") => ({ status, comparison: null, sources: src });

function item(id: string, o: Partial<KnowledgeItem> = {}): KnowledgeItem {
  return {
    id, category: "shop", layer: "point",
    trigger: { osm: ["shop=convenience"] },
    title: { en: id }, fact: { en: id },
    sources: src, confidence: "high", disputed: false, caveats: null,
    hometown: {}, ...o,
  };
}
function poi(o: Partial<NearbyPoi> = {}): NearbyPoi {
  return {
    id: "node/1", kind: "convenience", lat: 0, lon: 0,
    tags: { shop: "convenience" }, distanceM: 20, bearingDeg: 0, ...o,
  };
}
const rank = (items: KnowledgeItem[], o: Partial<Parameters<typeof rankCandidates>[0]> = {}) =>
  rankCandidates({ fix: fix(), profile: jp, pois: [poi()], items, state: emptyWalkState(), now: NOON, ...o });

describe("shouldSpeak", () => {
  it("speaks when never spoken, respects cooldown", () => {
    expect(shouldSpeak(emptyWalkState(), NOON)).toBe(true);
    const s: WalkState = { ...emptyWalkState(), lastSpokenAt: NOON };
    const cd = DEFAULT_TRIGGER_CONFIG.cooldownMs;
    expect(shouldSpeak(s, NOON + cd - 1)).toBe(false);
    expect(shouldSpeak(s, NOON + cd)).toBe(true);
  });
});

describe("exclusions", () => {
  it("drops told, low-confidence and unsourced items", () => {
    const items = [item("told"), item("low", { confidence: "low" }), item("nosrc", { sources: [] }), item("ok")];
    const state: WalkState = { ...emptyWalkState(), toldItemIds: ["told"] };
    expect(rank(items, { state }).map((c) => c.itemId)).toEqual(["ok"]);
  });
});

describe("point layer", () => {
  it("needs a matching POI within the accuracy-based radius", () => {
    const items = [item("a")];
    expect(rank(items, { pois: [] })).toHaveLength(0);
    expect(rank(items, { pois: [poi({ tags: { amenity: "cafe" }, kind: "other" })] })).toHaveLength(0);
    // accuracy 10 -> radius 50
    expect(rank(items, { pois: [poi({ distanceM: 49 })] })).toHaveLength(1);
    expect(rank(items, { pois: [poi({ distanceM: 60 })] })).toHaveLength(0);
    // accuracy 100 -> radius 140
    expect(rank(items, { fix: fix({ accuracy: 100 }), pois: [poi({ distanceM: 120 })] })).toHaveLength(1);
    // radius is capped at 150
    expect(rank(items, { fix: fix({ accuracy: 500 }), pois: [poi({ distanceM: 160 })] })).toHaveLength(0);
  });

  it("matches brand, wildcard and kind patterns", () => {
    const b = poi({ brand: "7-Eleven", tags: { shop: "convenience", brand: "7-Eleven" } });
    expect(rank([item("a", { trigger: { osm: ["brand=7-eleven"] } })], { pois: [b] })).toHaveLength(1);
    expect(rank([item("a", { trigger: { osm: ["shop=*"] } })], { pois: [b] })).toHaveLength(1);
    const bike = poi({ kind: "bicycle_rental", tags: {} });
    expect(rank([item("a", { trigger: { osm: ["bicycle_rental"] } })], { pois: [bike] })).toHaveLength(1);
  });

  it("gives an ahead bonus, and closer scores higher", () => {
    const items = [item("a")];
    const ahead = rank(items, { pois: [poi({ bearingDeg: 30 })] })[0];
    const behind = rank(items, { pois: [poi({ bearingDeg: 180 })] })[0];
    expect(ahead.score).toBeGreaterThan(behind.score);
    expect(ahead.reasons.join()).toContain("ahead");
    const noHeading = rank(items, { fix: fix({ heading: null }), pois: [poi({ bearingDeg: 30 })] })[0];
    expect(noHeading.score).toBeCloseTo(behind.score);
    const near = rank(items, { pois: [poi({ distanceM: 5, bearingDeg: 180 })] })[0];
    expect(near.score).toBeGreaterThan(behind.score);
    expect(ahead.poiId).toBe("node/1");
    expect(ahead.distanceM).toBe(20);
  });
});

describe("hometown relativity", () => {
  it("ranks the same items differently for JP vs US", () => {
    const x = item("x", { hometown: { US: cmp("absent"), JP: cmp("same") } });
    const y = item("y", { category: "street", hometown: { US: cmp("same"), JP: cmp("different") } });
    expect(rank([x, y], { profile: us })[0].itemId).toBe("x");
    expect(rank([x, y], { profile: jp })[0].itemId).toBe("y");
    expect(rank([x], { profile: us })[0].reasons).toContain("absent in US");
  });

  it("treats a missing entry as unknown, between different and same", () => {
    const mk = (s?: "same" | "different") => item("i", s ? { hometown: { JP: cmp(s) } } : {});
    const sc = (s?: "same" | "different") => rank([mk(s)])[0].score;
    expect(sc("different")).toBeGreaterThan(sc());
    expect(sc()).toBeGreaterThan(sc("same"));
  });
});

describe("other layers", () => {
  it("area items work without a POI but score below a good point match", () => {
    const area = item("area", { layer: "area", trigger: { osm: [] }, category: "street" });
    const point = item("pt");
    expect(rank([area, point]).map((c) => c.itemId)).toEqual(["pt", "area"]);
    expect(rank([area], { pois: [] })).toHaveLength(1);
  });

  it("national items only when no strong point item, or when idle", () => {
    const nat = item("nat", { layer: "national", trigger: { osm: [] }, category: "daily-life" });
    const strong = item("pt", { hometown: { JP: cmp("absent") } });
    expect(rank([nat, strong]).map((c) => c.itemId)).toEqual(["pt"]);
    expect(rank([nat], { pois: [] }).map((c) => c.itemId)).toEqual(["nat"]);
    const idleState: WalkState = { ...emptyWalkState(), lastSpokenAt: NOON - DEFAULT_TRIGGER_CONFIG.nationalItemIdleMs };
    expect(rank([nat, strong], { state: idleState }).map((c) => c.itemId)).toContain("nat");
  });
});

describe("penalties", () => {
  it("penalises the same category as the last story, less for the last 3", () => {
    const a = item("a", { category: "shop" });
    const b = item("b", { category: "transport" });
    const t1 = item("t1", { category: "shop" });
    const base = rank([a])[0].score;
    const hist = (ids: string[]): WalkState => ({
      toldItemIds: ids, lastSpokenAt: null, history: ids.map((itemId, i) => ({ itemId, at: i })),
    });
    const all = [a, b, t1];
    const last = rank(all, { state: hist(["t1"]) }).find((x) => x.itemId === "a")!;
    const recent = rank(all, { state: hist(["t1", "b"]) }).find((x) => x.itemId === "a")!;
    expect(last.score).toBeLessThan(recent.score);
    expect(recent.score).toBeLessThan(base);
    expect(last.reasons).toContain("same category as last story");
  });

  it("penalises disputed items and wrong time of day", () => {
    const base = rank([item("a")])[0].score;
    expect(rank([item("a", { disputed: true })])[0].score).toBeLessThan(base);
    const eve = item("a", { trigger: { osm: ["shop=convenience"], context: "garbage truck in the evening" } });
    expect(rank([eve], { now: NOON })[0].score).toBeLessThan(base);
    expect(rank([eve], { now: LATE })[0].score).toBeLessThan(base);
    expect(rank([eve], { now: EVENING })[0].score).toBeCloseTo(base);
  });
});

describe("output", () => {
  it("caps count, sorts by score, populates reasons, scores in 0..1", () => {
    const items = Array.from({ length: 8 }, (_, i) => item(`i${i}`, { layer: "area", trigger: { osm: [] } }));
    const out = rank(items);
    expect(out).toHaveLength(DEFAULT_TRIGGER_CONFIG.maxCandidates);
    for (let i = 1; i < out.length; i++) expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score);
    for (const c of out) {
      expect(c.reasons.length).toBeGreaterThan(0);
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(1);
    }
  });
});
