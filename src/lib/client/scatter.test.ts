import { describe, expect, it } from "vitest";
import { LABEL_H, scatterLayout } from "./scatter";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `d-${i}-abc`);

describe("scatterLayout", () => {
  it("is deterministic and handles empty input", () => {
    expect(scatterLayout(ids(7))).toEqual(scatterLayout(ids(7)));
    expect(scatterLayout([])).toEqual({ items: [], width: 360, height: 0 });
  });

  it("alternates left/right and grows with the item count", () => {
    const a = scatterLayout(ids(3));
    const b = scatterLayout(ids(6));
    expect(a.items.map((p) => p.x)).toEqual([a.items[0].x, b.width - a.items[0].x, a.items[0].x]);
    expect(a.items[0].x).toBeLessThan(a.width / 2);
    expect(a.items[1].x).toBeGreaterThan(a.width / 2);
    expect(b.height).toBeGreaterThan(a.height);
    // even vertical rhythm
    const ys = b.items.map((p) => p.y);
    for (let i = 1; i < ys.length - 1; i++) expect(ys[i + 1] - ys[i]).toBeCloseTo(ys[i] - ys[i - 1], 6);
  });

  it("keeps art and label columns inside the board with no art overlap", () => {
    for (const n of [1, 2, 5, 8]) {
      const { items, width, height } = scatterLayout(ids(n));
      expect(items).toHaveLength(n);
      for (const p of items) {
        expect(p.x - p.tileW / 2).toBeGreaterThanOrEqual(-0.001);
        expect(p.x + p.tileW / 2).toBeLessThanOrEqual(width + 0.001);
        expect(p.y - p.size / 2).toBeGreaterThanOrEqual(-0.001);
        expect(p.y + p.size / 2 + LABEL_H).toBeLessThanOrEqual(height + 0.001);
      }
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i];
          const b = items[j];
          const ox = Math.max(0, Math.min(a.x + a.size / 2, b.x + b.size / 2) - Math.max(a.x - a.size / 2, b.x - b.size / 2));
          const oy = Math.max(0, Math.min(a.y + a.size / 2, b.y + b.size / 2) - Math.max(a.y - a.size / 2, b.y - b.size / 2));
          expect(ox * oy).toBe(0);
        }
      }
    }
  });
});
