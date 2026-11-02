import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeoFix } from "@/lib/types";
import { areaNameAt, createSimulatedSource, distanceM, listRoutes, nearbyPois } from "./index";
import { bearingDeg } from "./math";

const fix = (lat: number, lon: number): GeoFix => ({ lat, lon, accuracy: 5, heading: null, speed: null, timestamp: 0 });

describe("math", () => {
  it("distance is about 111 km per degree of latitude", () => {
    const d = distanceM({ lat: 25, lon: 121 }, { lat: 26, lon: 121 });
    expect(d).toBeGreaterThan(110_500);
    expect(d).toBeLessThan(111_800);
  });
  it("bearing points to the cardinal directions", () => {
    const o = { lat: 25, lon: 121 };
    expect(bearingDeg(o, { lat: 25.01, lon: 121 })).toBeCloseTo(0, 0);
    expect(bearingDeg(o, { lat: 25, lon: 121.01 })).toBeCloseTo(90, 0);
    expect(bearingDeg(o, { lat: 24.99, lon: 121 })).toBeCloseTo(180, 0);
    expect(bearingDeg(o, { lat: 25, lon: 120.99 })).toBeCloseTo(270, 0);
  });
});

describe("simulated source", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("walks along the route and stops at the end", () => {
    const route = listRoutes()[0];
    const src = createSimulatedSource(route, { speedMps: 1.3, tickMs: 1000 });
    const fixes: GeoFix[] = [];
    src.start((f) => fixes.push(f));
    vi.advanceTimersByTime(10_000);
    expect(fixes.length).toBeGreaterThanOrEqual(10);
    expect(fixes.every((f) => f.simulated && f.accuracy === 5)).toBe(true);
    const moved = distanceM(fixes[0], fixes[fixes.length - 1]);
    expect(moved).toBeGreaterThan(5);
    expect(moved).toBeLessThan(15);
    expect(src.progress()).toBeGreaterThan(0);

    src.setSpeedMultiplier(1000);
    vi.advanceTimersByTime(5_000);
    expect(src.progress()).toBe(1);
    const n = fixes.length;
    vi.advanceTimersByTime(5_000);
    expect(fixes.length).toBe(n);
    const [lon, lat] = route.coordinates[route.coordinates.length - 1];
    expect(distanceM(fixes[fixes.length - 1], { lat, lon })).toBeLessThan(1);
  });

  it("ships routes of sensible length", () => {
    for (const r of listRoutes()) {
      let len = 0;
      for (let i = 1; i < r.coordinates.length; i++) {
        const [a, b] = [r.coordinates[i - 1], r.coordinates[i]];
        len += distanceM({ lat: a[1], lon: a[0] }, { lat: b[1], lon: b[0] });
      }
      expect(len).toBeGreaterThan(500);
    }
  });
});

describe("nearbyPois", () => {
  const start = listRoutes()[0].coordinates[0];
  const here = fix(start[1], start[0]);
  it("sorts by distance and respects the radius", () => {
    const near = nearbyPois(here, 150);
    expect(near.length).toBeGreaterThan(0);
    for (let i = 1; i < near.length; i++) expect(near[i].distanceM).toBeGreaterThanOrEqual(near[i - 1].distanceM);
    expect(near.every((p) => p.distanceM <= 150)).toBe(true);
    expect(nearbyPois(here, 400).length).toBeGreaterThan(near.length);
    expect(near[0].bearingDeg).toBeGreaterThanOrEqual(0);
    expect(near[0].bearingDeg).toBeLessThan(360);
  });
});

describe("areaNameAt", () => {
  it("returns the smallest containing area", () => {
    expect(areaNameAt(fix(25.0305, 121.5295))).toBe("Yongkang Street");
  });
  it("falls back to district and null outside", () => {
    expect(areaNameAt(fix(25.023, 121.538))).toBe("Da'an District");
    expect(areaNameAt(fix(24.9, 121.0))).toBeNull();
  });
});
