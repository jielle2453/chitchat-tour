import { describe, expect, it } from "vitest";
import type { Discovery } from "@/lib/types";
import {
  DEFAULT_QUIET_S,
  DEFAULT_SETTINGS,
  migrateDiscoveries,
  migrateProfile,
  migrateSettings,
  parseVersioned,
  sanitizeWalks,
  serialize,
} from "./storageFormat";

const disc = (id: string): Discovery => ({
  id,
  origin: "guide",
  at: 1,
  lat: 25,
  lon: 121,
  walkId: null,
  narration: { id: "n", itemId: null, title: "T", text: "x.", lang: "en", sources: [], confidence: "high" },
});

describe("parseVersioned", () => {
  it("returns data for the current version", () => {
    expect(parseVersioned(serialize(1, { a: 1 }), 1, { a: 0 })).toEqual({ a: 1 });
  });
  it("falls back on null, garbage and newer versions", () => {
    expect(parseVersioned(null, 1, "fb")).toBe("fb");
    expect(parseVersioned("{not json", 1, "fb")).toBe("fb");
    expect(parseVersioned(serialize(2, "future"), 1, "fb")).toBe("fb");
  });
  it("migrates older envelopes and bare legacy data", () => {
    const migrate = (d: unknown, from: number) => `m${from}:${JSON.stringify(d)}`;
    expect(parseVersioned(JSON.stringify({ v: 1, data: 5 }), 2, "fb", migrate)).toBe("m1:5");
    expect(parseVersioned(JSON.stringify({ lang: "en" }), 1, "fb", migrate)).toBe('m0:{"lang":"en"}');
  });
  it("uses the fallback when a migration rejects the data", () => {
    expect(parseVersioned(JSON.stringify([1, 2]), 1, "fb", () => null)).toBe("fb");
  });
});

describe("profile migration", () => {
  it("accepts the legacy bare profile and normalises the country code", () => {
    expect(migrateProfile({ hometown: "jp", lang: "ja" })).toEqual({ hometown: "JP", lang: "ja" });
  });
  it("allows an empty hometown and rejects unknown languages", () => {
    expect(migrateProfile({ hometown: "", lang: "en" })).toEqual({ hometown: "", lang: "en" });
    expect(migrateProfile({ hometown: "JP", lang: "xx" })).toBeNull();
    expect(migrateProfile("nope")).toBeNull();
  });
});

describe("settings migration", () => {
  it("fills defaults and clamps bad values", () => {
    expect(migrateSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(migrateSettings({ quietS: 60, voiceRate: 9, demo: true, routeId: "r" })).toEqual({ quietS: 60, voiceRate: 1, demo: true, routeId: "r" });
  });
  it("maps the old frequency values to quiet seconds", () => {
    expect(migrateSettings({ frequency: "often" })).toMatchObject({ quietS: 10 });
    expect(migrateSettings({ frequency: "normal" })).toMatchObject({ quietS: 15 });
    expect(migrateSettings({ frequency: "rarely" })).toMatchObject({ quietS: 30 });
    expect(migrateSettings({ frequency: "sometimes" })).toMatchObject({ quietS: DEFAULT_QUIET_S });
  });
  it("prefers quietS and snaps it to the 5–120 s slider range", () => {
    expect(migrateSettings({ quietS: 60, frequency: "often" })).toMatchObject({ quietS: 60 });
    expect(migrateSettings({ quietS: 7 })).toMatchObject({ quietS: 5 });
    expect(migrateSettings({ quietS: 8 })).toMatchObject({ quietS: 10 });
    expect(migrateSettings({ quietS: 1000 })).toMatchObject({ quietS: 120 });
    expect(migrateSettings({ quietS: 0 })).toMatchObject({ quietS: 5 });
    expect(migrateSettings({ quietS: "often" })).toMatchObject({ quietS: DEFAULT_QUIET_S });
    expect(migrateSettings({ quietS: NaN, frequency: "rarely" })).toMatchObject({ quietS: 30 });
  });
});

describe("notebook data sanitising", () => {
  it("drops malformed discoveries and fills missing location fields", () => {
    const bad = { id: "x" };
    const partial = { ...disc("b"), lat: undefined, walkId: undefined };
    const out = migrateDiscoveries([disc("a"), bad, null, partial]);
    expect(out?.map((d) => d.id)).toEqual(["a", "b"]);
    expect(out?.[1].lat).toBeNull();
    expect(out?.[1].walkId).toBeNull();
  });
  it("rejects non-arrays and repairs walk records", () => {
    expect(migrateDiscoveries({})).toBeNull();
    const w = sanitizeWalks([{ id: "w", startedAt: 1, path: [[1, 2]] }, { nope: true }]);
    expect(w).toHaveLength(1);
    expect(w?.[0]).toMatchObject({ endedAt: null, distanceM: 0, discoveryIds: [], simulated: false, areaName: null });
  });
});
