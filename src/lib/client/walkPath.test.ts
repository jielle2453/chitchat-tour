import { describe, expect, it } from "vitest";
import { appendThinned, dayKey, hiddenTooLong, pathDistanceM, projectPath, samplePath, thinPath, type LatLon } from "./walkPath";

// 0.0001 deg latitude is about 11.1 m
const step = (i: number): LatLon => [25 + i * 0.0001, 121.5];

describe("appendThinned", () => {
  it("keeps the first point and skips points closer than 8 m", () => {
    let r = appendThinned([], 25, 121.5);
    expect(r.path).toHaveLength(1);
    const same = r.path;
    r = appendThinned(r.path, 25.00003, 121.5); // ~3.3 m
    expect(r.path).toBe(same);
    expect(r.addedM).toBe(0);
    r = appendThinned(r.path, 25.0001, 121.5); // ~11 m
    expect(r.path).toHaveLength(2);
    expect(r.addedM).toBeGreaterThan(10);
  });
});

describe("thinPath and pathDistanceM", () => {
  it("drops dense points and keeps the distance about right", () => {
    const dense: LatLon[] = Array.from({ length: 101 }, (_, i) => [25 + i * 0.00002, 121.5]); // 222 m in 2.2 m steps
    const thin = thinPath(dense);
    expect(thin.length).toBeLessThan(dense.length / 3);
    expect(pathDistanceM(thin)).toBeGreaterThan(190);
    expect(pathDistanceM(thin)).toBeLessThan(225);
  });
  it("is zero for fewer than two points", () => {
    expect(pathDistanceM([])).toBe(0);
    expect(pathDistanceM([step(0)])).toBe(0);
  });
});

describe("dayKey and hiddenTooLong", () => {
  it("formats the local calendar day", () => {
    expect(dayKey(new Date(2026, 10, 2, 23, 59).getTime())).toBe("2026-11-02");
    expect(dayKey(new Date(2026, 0, 5, 0, 1).getTime())).toBe("2026-01-05");
  });
  it("ends a walk only after more than 30 minutes hidden", () => {
    expect(hiddenTooLong(null, 10_000_000)).toBe(false);
    expect(hiddenTooLong(0, 29 * 60_000)).toBe(false);
    expect(hiddenTooLong(0, 31 * 60_000)).toBe(true);
  });
});

describe("samplePath and projectPath", () => {
  it("keeps endpoints when sampling down", () => {
    const p = Array.from({ length: 50 }, (_, i) => step(i));
    const s = samplePath(p, 10);
    expect(s).toHaveLength(10);
    expect(s[0]).toEqual(p[0]);
    expect(s[9]).toEqual(p[49]);
  });
  it("projects inside the box", () => {
    const pts = projectPath([step(0), step(5), [25.0005, 121.5008]], 100, 60, 6);
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(5.99);
      expect(x).toBeLessThanOrEqual(94.01);
      expect(y).toBeGreaterThanOrEqual(5.99);
      expect(y).toBeLessThanOrEqual(54.01);
    }
  });
});
