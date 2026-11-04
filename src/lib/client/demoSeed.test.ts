import { describe, expect, it, vi } from "vitest";
import type { KnowledgeItem } from "@/lib/types";
import { buildSeedData, DEMO_PAST_WALKS, shortenLine } from "./demoSeed";
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

const allIds = DEMO_PAST_WALKS.flatMap((w) => w.itemIds);
const items = allIds.map((id, i) => item(id, i % 2 === 0));
const line = (lon: number, lat: number): [number, number][] => Array.from({ length: 20 }, (_, i) => [lon + i * 0.0001, lat + i * 0.0001]);
const routes = {
  dadaocheng: line(121.51, 25.054),
  minsheng: line(121.556, 25.06),
  tainan: line(120.196, 22.997),
  ximen: line(121.507, 25.042),
  zhongshan: line(121.52, 25.053),
};
const now = new Date(2026, 10, 3, 15, 0).getTime(); // a Tuesday afternoon, local

describe("buildSeedData", () => {
  it("seeds each past walk on its own day and route, using real titles", () => {
    const { discoveries, walks } = buildSeedData({ items, routes, lang: "en", hometown: "JP", now });
    expect(discoveries).toHaveLength(allIds.length);
    expect(walks.map((w) => w.id)).toEqual(DEMO_PAST_WALKS.map((w) => w.id));
    const dadaocheng = walks.find((w) => w.id === "demo-walk-dadaocheng")!;
    const tainan = walks.find((w) => w.id === "demo-walk-tainan")!;
    expect(dadaocheng.mode).toBe("wander");
    expect(dadaocheng.destination).toBeNull();
    expect(tainan.mode).toBe("destination");
    expect(tainan.destination?.name).toBe("Shennong Street");
    expect(dayKey(dadaocheng.startedAt)).toBe("2026-11-02");
    expect(dayKey(tainan.startedAt)).toBe("2026-10-31");
    const byId = new Map(discoveries.map((d) => [d.id, d]));
    for (const w of walks) {
      expect(w.id.startsWith("demo-")).toBe(true);
      expect(w.simulated).toBe(true);
      expect(w.distanceM).toBeGreaterThan(0);
      expect(w.path.length).toBeGreaterThan(1);
      expect(w.endedAt).toBeLessThan(now);
      const ats = w.discoveryIds.map((id) => byId.get(id)!.at);
      expect(ats).toEqual([...ats].sort((a, b) => a - b));
      for (const id of w.discoveryIds) {
        const d = byId.get(id)!;
        expect(d.id.startsWith("demo-")).toBe(true);
        expect(d.walkId).toBe(w.id);
        expect(d.at).toBeGreaterThan(w.startedAt);
        expect(d.at).toBeLessThan(w.endedAt!);
        expect(d.narration.title).toMatch(/^Title /);
      }
    }
    expect(dadaocheng.path).not.toEqual(tainan.path);
    // newest first, each on its own day
    const starts = walks.map((w) => w.startedAt);
    expect(starts).toEqual([...starts].sort((a, b) => b - a));
    expect(new Set(walks.map((w) => dayKey(w.startedAt))).size).toBe(walks.length);
  });

  it("localises the destination name", () => {
    const { walks } = buildSeedData({ items, routes, lang: "zh-TW", hometown: "", now });
    expect(walks.find((w) => w.id === "demo-walk-tainan")!.destination?.name).toBe("神農街");
  });

  it("skips a walk whose route is missing", () => {
    const { walks, discoveries } = buildSeedData({ items, routes: { tainan: routes.tainan }, lang: "en", hometown: "", now });
    expect(walks.map((w) => w.id)).toEqual(["demo-walk-tainan"]);
    expect(discoveries.every((d) => d.walkId === "demo-walk-tainan")).toBe(true);
  });

  it("builds short one-line here/elsewhere chips only when the hometown has a comparison", () => {
    const { discoveries } = buildSeedData({ items, routes, lang: "en", hometown: "JP", now });
    const withCmp = discoveries.find((d) => d.narration.itemId === allIds[0])!;
    expect(withCmp.narration.contrast).toEqual({ here: `Title ${allIds[0]}`, elsewhere: `In Japan ${allIds[0]} differs` });
    for (const d of discoveries) {
      const c = d.narration.contrast;
      if (c) {
        expect(c.here.split(/\s+/).length).toBeLessThanOrEqual(12);
        expect(c.elsewhere.split(/\s+/).length).toBeLessThanOrEqual(12);
        expect(c.here).not.toContain("Second sentence");
      }
    }
    const noCmp = discoveries.find((d) => d.narration.itemId === allIds[1])!;
    expect(noCmp.narration.contrast).toBeNull();
    const unknown = buildSeedData({ items, routes, lang: "en", hometown: "", now });
    expect(unknown.discoveries.every((d) => d.narration.contrast === null)).toBe(true);
  });

  it("trims long comparisons to a first clause of at most 12 words / 20 CJK chars", () => {
    expect(shortenLine("Eating and drinking, including plain water, are banned inside the paid area of the metro.")).toBe("Eating and drinking");
    expect(shortenLine("You pay for trash by buying the bag.")).toBe("You pay for trash by buying the bag");
    expect(shortenLine("東京地下鐵官方 FAQ 說車內飲食沒有限制，只請不要造成他人困擾。後面還有很多字。")).toBe("東京地下鐵官方 FAQ 說車內飲食沒有限");
    expect(shortenLine("Short.")).toBe("Short");
  });

  it("localises titles and facts", () => {
    const { discoveries } = buildSeedData({ items, routes, lang: "zh-TW", hometown: "", now });
    expect(discoveries[0].narration.title).toMatch(/^標題/);
    expect(discoveries[0].narration.lang).toBe("zh-TW");
  });
});

describe("resetSimulatedNotebook", () => {
  it("drops earlier simulated replays and their stories, keeps real walks", async () => {
    const mem = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    });
    const { readDiscoveries, readWalks, writeStored } = await import("./storage");
    const { KEYS } = await import("./storageFormat");
    const { resetSimulatedNotebook } = await import("./demoSeed");
    const w = (id: string, simulated: boolean) => ({ id, startedAt: 1, endedAt: 2, areaName: null, distanceM: 10, path: [], discoveryIds: [], simulated });
    const d = (id: string, walkId: string) => ({ id, narration: { id, title: id, text: id, lang: "en", sources: [], confidence: "high", category: "street", contrast: null }, origin: "guide", at: 1, walkId });
    writeStored(KEYS.walks, [w("old-replay", true), w("real", false), w("demo-walk-x", true)]);
    writeStored(KEYS.discoveries, [d("a", "old-replay"), d("b", "real")]);
    resetSimulatedNotebook({ lang: "en", hometown: "JP" });
    expect(readWalks().map((x) => x.id)).toEqual(["real", "demo-walk-x"]);
    expect(readDiscoveries().map((x) => x.id)).toEqual(["b"]);
    vi.unstubAllGlobals();
  });
});
