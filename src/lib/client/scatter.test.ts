import { describe, expect, it } from "vitest";
import { scatterLayout } from "./scatter";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `d-${i}-abc`);

describe("scatterLayout", () => {
  it("is deterministic", () => {
    expect(scatterLayout(ids(7))).toEqual(scatterLayout(ids(7)));
  });

  it("keeps every sticker inside the board", () => {
    for (const n of [1, 2, 3, 5, 8, 13]) {
      const { items, width, height } = scatterLayout(ids(n));
      expect(items).toHaveLength(n);
      for (const p of items) {
        expect(p.x - p.size / 2).toBeGreaterThanOrEqual(-0.001);
        expect(p.x + p.size / 2).toBeLessThanOrEqual(width + 0.001);
        expect(p.y - p.size / 2).toBeGreaterThanOrEqual(-0.001);
        expect(p.y + p.size / 2).toBeLessThanOrEqual(height + 0.001);
        expect(Math.abs(p.rot)).toBeLessThanOrEqual(9);
      }
    }
  });

  it("overlaps neighbours by less than 20% of the smaller sticker", () => {
    for (const n of [4, 9, 12]) {
      const { items } = scatterLayout(ids(n));
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i];
          const b = items[j];
          const ox = Math.max(0, Math.min(a.x + a.size / 2, b.x + b.size / 2) - Math.max(a.x - a.size / 2, b.x - b.size / 2));
          const oy = Math.max(0, Math.min(a.y + a.size / 2, b.y + b.size / 2) - Math.max(a.y - a.size / 2, b.y - b.size / 2));
          const smaller = Math.min(a.size, b.size) ** 2;
          expect((ox * oy) / smaller).toBeLessThan(0.2);
        }
      }
    }
  });

  it("differs when ids differ and handles empty input", () => {
    expect(scatterLayout(["a", "b"]).items[0].rot).not.toBe(scatterLayout(["c", "d"]).items[0].rot);
    expect(scatterLayout([])).toEqual({ items: [], width: 360, height: 0 });
  });
});
