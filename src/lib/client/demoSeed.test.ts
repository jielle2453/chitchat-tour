import { describe, expect, it } from "vitest";
import type { KnowledgeItem } from "@/lib/types";
import { buildSeedData, DEMO_DEST_IDS, DEMO_WANDER_IDS, seedTimes, shortenLine } from "./demoSeed";
import { dayKey } from "./walkPath";

const item = (id: string, withHometown: boolean): KnowledgeItem => ({
  id,
  category: "street",
  layer: "point",
  trigger: { osm: [] },
  title: { en: `Title ${id}`, "zh-TW": `標題${id}` },
  fact: { en: `First sentence about ${id}. Second sentence here.`, "zh-TW": `關於${id}的第一句。第二句。` },
  sources: [{ url: "https://example.com", title: "Example", publisher: "Ex", verified: "full-text" }],
  confidence: "high",
  disputed: false,
  caveats: null,
  hometown: withHometown
    ? { JP: { status: "different", comparison: { en: `In Japan ${id} differs.`, "zh-TW": `在日本${id}不同。` }, sources: [], confidence: "high" } }
    : {},
});

const items = [...DEMO_WANDER_IDS.map((id) => item(id, true)), ...DEMO_DEST_IDS.map((id) => item(id, false))];
const routeCoords: [number, number][] = Array.from({ length: 20 }, (_, i) => [121.52 + i * 0.0001, 25.03 + i * 0.0001]);
const destRouteCoords: [number, number][] = Array.from({ length: 16 }, (_, i) => [121.521 + i * 0.0001, 25.031 + i * 0.0001]);
const now = new Date(2026, 10, 3, 15, 0).getTime(); // a Tuesday afternoon, local

describe("buildSeedData", () => {
  it("seeds a wander today and a destination walk yesterday, using real titles", () => {
    const { discoveries, walks } = buildSeedData({ items, routeCoords, destRouteCoords, lang: "en", hometown: "JP", now });
    expect(discoveries).toHaveLength(DEMO_WANDER_IDS.length + DEMO_DEST_IDS.length);
    expect(walks).toHaveLength(2);
    const [wander, dest] = walks;
    expect(wander.mode).toBe("wander");
    expect(wander.destination).toBeNull();
    expect(dest.mode).toBe("destination");
    expect(dest.destination?.name).toBe("Dongmen Market");
    // discoveries spread along each path, in walking order
    expect(wander.discoveryIds).toHaveLength(DEMO_WANDER_IDS.length);
    expect(dest.discoveryIds).toHaveLength(DEMO_DEST_IDS.length);
    expect(dayKey(wander.startedAt)).toBe("2026-11-03");
    expect(dayKey(dest.startedAt)).toBe("2026-11-02");
    const byId = new Map(discoveries.map((d) => [d.id, d]));
    for (const w of walks) {
      expect(w.simulated).toBe(true);
      expect(w.distanceM).toBeGreaterThan(0);
      expect(w.path.length).toBeGreaterThan(1);
      const ats = w.discoveryIds.map((id) => byId.get(id)!.at);
      expect(ats).toEqual([...ats].sort((a, b) => a - b));
      for (const id of w.discoveryIds) {
        const d = byId.get(id)!;
        expect(d.walkId).toBe(w.id);
        expect(d.narration.title).toMatch(/^Title /);
      }
    }
    // the two walks run on different routes
    expect(wander.path).not.toEqual(dest.path);
  });

  it("localises the destination name", () => {
    const { walks } = buildSeedData({ items, routeCoords, destRouteCoords, lang: "zh-TW", hometown: "", now });
    expect(walks[1].destination?.name).toBe("東門市場");
  });

  it("builds short one-line here/elsewhere chips only when the hometown has a comparison", () => {
    const { discoveries } = buildSeedData({ items, routeCoords, destRouteCoords, lang: "en", hometown: "JP", now });
    const withCmp = discoveries.find((d) => d.narration.itemId === DEMO_WANDER_IDS[0])!;
    expect(withCmp.narration.contrast).toEqual({ here: `Title ${DEMO_WANDER_IDS[0]}`, elsewhere: `In Japan ${DEMO_WANDER_IDS[0]} differs` });
    for (const d of discoveries) {
      const c = d.narration.contrast;
      if (c) {
        expect(c.here.split(/\s+/).length).toBeLessThanOrEqual(12);
        expect(c.elsewhere.split(/\s+/).length).toBeLessThanOrEqual(12);
        expect(c.here).not.toContain("Second sentence");
      }
    }
    const noCmp = discoveries.find((d) => d.narration.itemId === DEMO_DEST_IDS[0])!;
    expect(noCmp.narration.contrast).toBeNull();
    const unknown = buildSeedData({ items, routeCoords, destRouteCoords, lang: "en", hometown: "", now });
    expect(unknown.discoveries.every((d) => d.narration.contrast === null)).toBe(true);
  });

  it("trims long comparisons to a first clause of at most 12 words / 20 CJK chars", () => {
    expect(shortenLine("Eating and drinking, including plain water, are banned inside the paid area of the metro.")).toBe("Eating and drinking");
    expect(shortenLine("You pay for trash by buying the bag.")).toBe("You pay for trash by buying the bag");
    expect(shortenLine("東京地下鐵官方 FAQ 說車內飲食沒有限制，只請不要造成他人困擾。後面還有很多字。")).toBe("東京地下鐵官方 FAQ 說車內飲食沒有限");
    expect(shortenLine("Short.")).toBe("Short");
  });

  it("keeps all of today's items within today, even just after midnight", () => {
    const justAfterMidnight = new Date(2026, 10, 3, 0, 30).getTime();
    const ats = seedTimes(justAfterMidnight, 6);
    expect(ats).toHaveLength(6);
    for (const at of ats) {
      expect(dayKey(at)).toBe("2026-11-03");
      expect(at).toBeLessThanOrEqual(justAfterMidnight);
    }
    const { discoveries, walks } = buildSeedData({ items, routeCoords, destRouteCoords, lang: "en", hometown: "JP", now: justAfterMidnight });
    const wander = walks.find((w) => w.mode === "wander")!;
    for (const id of wander.discoveryIds) expect(dayKey(discoveries.find((d) => d.id === id)!.at)).toBe("2026-11-03");
  });

  it("localises titles and facts", () => {
    const { discoveries } = buildSeedData({ items, routeCoords, destRouteCoords, lang: "zh-TW", hometown: "", now });
    expect(discoveries[0].narration.title).toMatch(/^標題/);
    expect(discoveries[0].narration.lang).toBe("zh-TW");
  });
});
