import { describe, expect, it } from "vitest";
import type { Discovery, WalkRecord } from "@/lib/types";
import { formatDay, groupByDay, parseDayKey } from "./notebook";

const at = (d: number, h: number) => new Date(2026, 10, d, h).getTime();
const disc = (id: string, t: number, walkId: string | null = null): Discovery => ({
  id,
  origin: "guide",
  at: t,
  lat: null,
  lon: null,
  walkId,
  narration: { id, itemId: null, title: id, text: "x.", lang: "en", sources: [], confidence: "high" },
});
const walk = (id: string, t: number, area: string | null): WalkRecord => ({
  id,
  startedAt: t,
  endedAt: t + 1,
  areaName: area,
  distanceM: 500,
  path: [
    [25, 121],
    [25.001, 121],
  ],
  discoveryIds: [],
  simulated: false,
});

describe("groupByDay", () => {
  it("groups by local day, newest day first, stickers in walking order", () => {
    const days = groupByDay([disc("late", at(2, 18)), disc("early", at(2, 9)), disc("old", at(1, 12))], [walk("w1", at(2, 8), "Yongkang Street")]);
    expect(days.map((d) => d.date)).toEqual(["2026-11-02", "2026-11-01"]);
    expect(days[0].discoveries.map((d) => d.id)).toEqual(["early", "late"]);
    expect(days[0]).toMatchObject({ areaName: "Yongkang Street", distanceM: 500 });
    expect(days[0].paths).toHaveLength(1);
    expect(days[1].areaName).toBeNull();
  });
  it("omits days with no stickers", () => {
    expect(groupByDay([], [walk("w", at(2, 8), "x")])).toEqual([]);
  });
});

describe("day keys", () => {
  it("parses and rejects", () => {
    expect(parseDayKey("2026-11-02")?.getDate()).toBe(2);
    expect(parseDayKey("nope")).toBeNull();
    expect(formatDay("bad", "en")).toBe("bad");
  });
});
