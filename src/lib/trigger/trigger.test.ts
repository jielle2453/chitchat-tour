import { describe, expect, it } from "vitest";
import type { GeoFix, KnowledgeItem, NearbyPoi, Sighting, UserProfile, WalkState } from "@/lib/types";
import {
  addSighting,
  agePhrase,
  conceptsMatch,
  DEFAULT_TRIGGER_CONFIG,
  emptyWalkState,
  findConceptsInText,
  rankCandidates,
  shouldSpeak,
  SIGHTING_WINDOW_MS,
  topicGroup,
} from "./index";

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

  it("never offers facet items, even with a matching POI or sighting", () => {
    const facetPoint = item("convenience-store-area-density", { parent: "convenience-store-density" });
    expect(rank([facetPoint])).toHaveLength(0);
    const facetSighting = item("garbage-truck-japan-origin", {
      parent: "garbage-truck-why-music",
      layer: "sighting",
      trigger: { osm: [], photo_concepts: ["garbage truck"] },
      category: "daily-life",
    });
    const state: WalkState = {
      ...emptyWalkState(),
      sightings: [{ concept: "garbage truck", at: NOON - 1000, source: "photo" }],
    };
    expect(rank([facetSighting], { pois: [], state, now: NOON })).toHaveLength(0);
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
  it("area items are quiet-stretch fillers: dropped while a point match exists", () => {
    const area = item("area", { layer: "area", trigger: { osm: [] }, category: "street" });
    const point = item("pt");
    expect(rank([area, point]).map((c) => c.itemId)).toEqual(["pt"]);
    // alone on a fresh walk with nothing nearby, the area fact may speak
    expect(rank([area], { pois: [] })).toHaveLength(1);
  });

  it("area items wait for a longer idle gap once the walk has started", () => {
    const area = item("area", { layer: "area", trigger: { osm: [] }, category: "street" });
    const justSpoke: WalkState = { ...emptyWalkState(), lastSpokenAt: NOON - 60_000 };
    expect(rank([area], { pois: [], state: justSpoke, now: NOON })).toHaveLength(0);
    const idle: WalkState = { ...emptyWalkState(), lastSpokenAt: NOON - 300_000 };
    const out = rank([area], { pois: [], state: idle, now: NOON });
    expect(out.map((c) => c.itemId)).toEqual(["area"]);
    expect(out[0].reasons.join()).toContain("quiet for a while");
  });

  it("national items only when nothing is encountered and the walker is idle", () => {
    const nat = item("nat", { layer: "national", trigger: { osm: [] }, category: "daily-life" });
    const strong = item("pt", { hometown: { JP: cmp("absent") } });
    expect(rank([nat, strong]).map((c) => c.itemId)).toEqual(["pt"]);
    expect(rank([nat], { pois: [] }).map((c) => c.itemId)).toEqual(["nat"]);
    const idleState: WalkState = { ...emptyWalkState(), lastSpokenAt: NOON - DEFAULT_TRIGGER_CONFIG.nationalItemIdleMs };
    // even when idle, a real point match keeps the filler out
    expect(rank([nat, strong], { state: idleState, now: NOON }).map((c) => c.itemId)).toEqual(["pt"]);
    expect(rank([nat], { pois: [], state: idleState, now: NOON }).map((c) => c.itemId)).toEqual(["nat"]);
    const justSpoke: WalkState = { ...emptyWalkState(), lastSpokenAt: NOON - 60_000 };
    expect(rank([nat], { pois: [], state: justSpoke, now: NOON })).toHaveLength(0);
  });
});

describe("sighting layer", () => {
  const truck = (id: string, o: Partial<KnowledgeItem> = {}) =>
    item(id, { layer: "sighting", trigger: { osm: [], photo_concepts: ["garbage truck"] }, category: "daily-life", ...o });
  const seen = (concept: string, at: number, source: Sighting["source"] = "photo"): WalkState => ({
    ...emptyWalkState(),
    sightings: [{ concept, at, source }],
  });

  it("is a candidate only with a recent matching sighting", () => {
    expect(rank([truck("t")], { pois: [] })).toHaveLength(0);
    expect(rank([truck("t")], { pois: [], state: seen("garbage truck", NOON - 2 * 60_000), now: NOON })).toHaveLength(1);
    // older than ~10 minutes: the truck is long gone
    const stale = seen("garbage truck", NOON - SIGHTING_WINDOW_MS - 1);
    expect(rank([truck("t")], { pois: [], state: stale, now: NOON })).toHaveLength(0);
  });

  it("matches case-insensitively with plurals and synonyms", () => {
    expect(rank([truck("t")], { pois: [], state: seen("Garbage Trucks", NOON - 1000), now: NOON })).toHaveLength(1);
    expect(rank([truck("t")], { pois: [], state: seen("trash truck", NOON - 1000), now: NOON })).toHaveLength(1);
    expect(rank([truck("t")], { pois: [], state: seen("utility pole", NOON - 1000), now: NOON })).toHaveLength(0);
  });

  it("scores high and explains itself in the trace", () => {
    const area = item("area", { layer: "area", trigger: { osm: [] }, category: "street" });
    const out = rank([area, truck("t")], { pois: [], state: seen("garbage truck", NOON - 2 * 60_000), now: NOON });
    expect(out.map((c) => c.itemId)).toEqual(["t"]);
    expect(out[0].reasons.join("; ")).toContain("you photographed garbage truck 2 min ago");
  });

  it("reports ask-source sightings differently", () => {
    const out = rank([truck("t")], { pois: [], state: seen("garbage truck", NOON - 30_000, "ask"), now: NOON });
    expect(out[0].reasons.join("; ")).toContain("you asked about garbage truck just now");
  });
});

describe("topic de-duplication", () => {
  const truck = (id: string) =>
    item(id, { layer: "sighting", trigger: { osm: [], photo_concepts: ["garbage truck"] }, category: "daily-life" });
  // Synthetic same-topic pair: the two-segment fallback puts both in "story-apple".
  const apple = (id: string) => truck(id);

  it("offers only the best item per group at a time", () => {
    const a = item("mrt-station-codes", { category: "transport", trigger: { osm: ["railway=subway_entrance"] } });
    const b = item("priority-seats-renamed-2025", { category: "transport", trigger: { osm: ["railway=subway_entrance"] } });
    const subway = poi({ id: "node/9", kind: "subway_entrance", tags: { railway: "subway_entrance" } });
    expect(rank([a, b], { pois: [subway] })).toHaveLength(1);
  });

  it("blocks a second item of the same group later in the walk, unless asked", () => {
    const state: WalkState = {
      toldItemIds: ["story-apple-pie"],
      lastSpokenAt: NOON - 600_000,
      history: [{ itemId: "story-apple-pie", at: NOON - 600_000 }],
      sightings: [{ concept: "garbage truck", at: NOON - 1000, source: "photo" }],
    };
    expect(rank([apple("story-apple-tart")], { pois: [], state, now: NOON })).toHaveLength(0);
    const asked: WalkState = {
      ...state,
      sightings: [{ concept: "garbage truck", at: NOON - 1000, source: "ask" }],
    };
    const out = rank([apple("story-apple-tart")], { pois: [], state: asked, now: NOON });
    expect(out).toHaveLength(1);
    expect(out[0].reasons).toContain("you asked about this again");
  });

  it("groups odd ids explicitly and falls back to a two-segment prefix", () => {
    expect(topicGroup("manhole-covers-art")).toBe("manhole");
    expect(topicGroup("manhole-anti-slip")).toBe("manhole");
    expect(topicGroup("two-stage-left-turn-tainan")).toBe("two-stage-left-turn");
    expect(topicGroup("mrt-station-codes")).toBe("mrt");
    expect(topicGroup("escalator-stand-both-sides")).toBe("mrt");
    expect(topicGroup("claw-machine-shops")).toBe("claw-machine");
    expect(topicGroup("bubble-tea-dispute")).toBe("bubble-tea");
    expect(topicGroup("brand-new-thing")).toBe("brand-new");
  });
});

describe("sighting utils", () => {
  it("conceptsMatch forgives case, plurals and synonyms", () => {
    expect(conceptsMatch("Garbage Truck", "garbage truck")).toBe(true);
    expect(conceptsMatch("garbage trucks", "garbage truck")).toBe(true);
    expect(conceptsMatch("trash truck", "garbage truck")).toBe(true);
    expect(conceptsMatch("litter bin", "street trash can")).toBe(true);
    expect(conceptsMatch("utility pole", "garbage truck")).toBe(false);
    expect(conceptsMatch("", "garbage truck")).toBe(false);
  });

  it("addSighting appends, refreshes and caps", () => {
    const s1 = addSighting(emptyWalkState(), "garbage truck", "photo", NOON);
    expect(s1.sightings).toHaveLength(1);
    const s2 = addSighting(s1, "Garbage Trucks", "ask", NOON + 1000);
    expect(s2.sightings).toHaveLength(1);
    expect(s2.sightings![0]).toEqual({ concept: "Garbage Trucks", at: NOON + 1000, source: "ask" });
    expect(s1.sightings).toHaveLength(1); // no mutation
    expect(addSighting(s1, "  ", "photo", NOON)).toBe(s1);
  });

  it("findConceptsInText finds known concepts in a question", () => {
    const known = ["garbage truck", "truck", "manhole cover"];
    expect(findConceptsInText("Why does the garbage truck play music?", known)).toEqual(["garbage truck"]);
    expect(findConceptsInText("What a nice street!", known)).toEqual([]);
  });

  it("agePhrase reads naturally", () => {
    expect(agePhrase(NOON - 10_000, NOON)).toBe("just now");
    expect(agePhrase(NOON - 60_000, NOON)).toBe("1 min ago");
    expect(agePhrase(NOON - 120_000, NOON)).toBe("2 min ago");
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
