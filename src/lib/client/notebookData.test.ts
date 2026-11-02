import { describe, expect, it } from "vitest";
import type { Discovery, WalkRecord } from "@/lib/types";
import { formatDuration, formatDurationShort, formatMonthTitle, formatTicketDate, groupByTheme, groupWalksByMonth, newestWalksFirst, themeKeyOf, ticketStubParts, walkDurationMin, walkPlaceLabel, walkPlaceParts } from "./notebookData";

const disc = (id: string, at: number, category: Discovery["narration"]["category"], itemId: string | null = "x"): Discovery => ({
  id,
  origin: "guide",
  at,
  lat: null,
  lon: null,
  walkId: null,
  narration: { id, itemId, title: id, text: "x.", lang: "en", sources: [], confidence: "high", category },
});

const walk = (id: string, startedAt: number, extra: Partial<WalkRecord> = {}): WalkRecord => ({
  id,
  startedAt,
  endedAt: startedAt + 30 * 60_000,
  areaName: "Yongkang Street",
  distanceM: 800,
  path: [
    [25, 121],
    [25.001, 121],
  ],
  discoveryIds: [],
  simulated: false,
  ...extra,
});

describe("walkPlaceLabel", () => {
  it("joins area and destination with an arrow for destination walks", () => {
    const w = walk("w", Date.now(), { mode: "destination", destination: { name: "東門市場", lat: 25.034, lon: 121.528 } });
    expect(walkPlaceLabel(w, "zh-TW")).toBe("永康街商圈 → 東門市場");
    expect(walkPlaceLabel(w, "en")).toBe("Yongkang Street → 東門市場");
  });
  it("falls back to area or the unknown-area label", () => {
    expect(walkPlaceLabel(walk("w", 1, { mode: "wander" }), "en")).toBe("Yongkang Street");
    expect(walkPlaceLabel(walk("w", 1, { areaName: null }), "en")).toBe("Out and about");
    const destOnly = walk("w", 1, { mode: "destination", areaName: null, destination: { name: "X", lat: 0, lon: 0 } });
    expect(walkPlaceLabel(destOnly, "en")).toBe("X");
  });
});

describe("dates and durations", () => {
  it("formats a short localized ticket date", () => {
    const ms = new Date(2026, 10, 3, 15, 0).getTime(); // Tuesday
    expect(formatTicketDate(ms, "zh-TW")).toContain("11月3日");
    expect(formatTicketDate(ms, "en")).toMatch(/Nov.*3|3.*Nov/);
  });
  it("formats durations and open walks", () => {
    expect(formatDuration(5, "en")).toBe("5 min");
    expect(formatDuration(75, "en")).toBe("1 h 15 min");
    expect(formatDuration(75, "zh-TW")).toBe("1 小時 15 分鐘");
    const open = walk("w", 1_000_000, { endedAt: null });
    expect(walkDurationMin(open, 1_000_000 + 10 * 60_000)).toBe(10);
  });
  it("sorts walks newest first", () => {
    const ws = [walk("a", 100), walk("b", 300), walk("c", 200)];
    expect(newestWalksFirst(ws).map((w) => w.id)).toEqual(["b", "c", "a"]);
  });
});

describe("ticket stub and meta", () => {
  it("splits destination titles into area + dest parts", () => {
    const w = walk("w", Date.now(), { mode: "destination", destination: { name: "東門市場", lat: 25.034, lon: 121.528 } });
    expect(walkPlaceParts(w, "zh-TW")).toEqual({ area: "永康街商圈", dest: "東門市場" });
    expect(walkPlaceParts(walk("w", 1, { mode: "wander" }), "en")).toEqual({ area: "Yongkang Street", dest: null });
  });
  it("formats compact durations without the date", () => {
    expect(formatDurationShort(32, "zh-TW")).toBe("32 分");
    expect(formatDurationShort(32, "en")).toBe("32 min");
    expect(formatDurationShort(32, "ja")).toBe("32分");
    expect(formatDurationShort(65, "zh-TW")).toBe("1 小時 5 分");
    expect(formatDurationShort(65, "en")).toBe("1 h 5 min");
  });
  it("returns fixed stub parts per locale", () => {
    const ms = new Date(2026, 10, 2, 15, 0).getTime(); // Monday
    expect(ticketStubParts(ms, "zh-TW")).toEqual({ weekday: "週一", day: "2", month: "11月" });
    expect(ticketStubParts(ms, "en")).toEqual({ weekday: "Mon", day: "2", month: "Nov" });
    expect(ticketStubParts(ms, "ja").month).toBe("11月");
  });
  it("formats month titles and groups walks by month", () => {
    expect(formatMonthTitle(2026, 11, "zh-TW")).toBe("2026年11月");
    expect(formatMonthTitle(2026, 11, "en")).toBe("November 2026");
    const ws = [walk("a", new Date(2026, 9, 5).getTime()), walk("b", new Date(2026, 10, 3).getTime()), walk("c", new Date(2026, 10, 20).getTime())];
    const groups = groupWalksByMonth(ws);
    expect(groups.map((g) => g.key)).toEqual(["2026-11", "2026-10"]);
    expect(groups[0].walks.map((w) => w.id)).toEqual(["c", "b"]);
  });
});

describe("themes", () => {
  it("maps live discoveries to the live theme and groups in walking order", () => {
    expect(themeKeyOf(disc("a", 1, "other", "live:abc"))).toBe("live");
    expect(themeKeyOf(disc("b", 1, undefined))).toBe("other");
    const groups = groupByTheme([
      disc("s2", 20, "street"),
      disc("l1", 30, "shop", "live:q"),
      disc("s1", 10, "street"),
      disc("o1", 5, undefined),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["street", "live", "other"]);
    expect(groups[0].items.map((d) => d.id)).toEqual(["s1", "s2"]);
  });
  it("orders themes by count desc, ties keep theme order", () => {
    const groups = groupByTheme([
      disc("o1", 1, undefined),
      disc("s1", 2, "street"),
      disc("t1", 3, "transport"),
      disc("t2", 4, "transport"),
      disc("t3", 5, "transport"),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["transport", "street", "other"]);
  });
});
