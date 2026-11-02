import { describe, expect, it } from "vitest";
import { alphaBounds, DARK_LINE, roundedBoxRadius, stickerLayout, stickerScale, STICKER_MAX, TRIM_SLACK, WHITE_BORDER } from "./sticker";

describe("alphaBounds", () => {
  it("finds the opaque region", () => {
    const w = 6;
    const h = 5;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 1; y <= 3; y++) for (let x = 2; x <= 4; x++) data[(y * w + x) * 4 + 3] = 255;
    expect(alphaBounds(data, w, h)).toEqual([2, 1, 5, 4]);
  });
  it("returns null for a fully transparent image", () => {
    expect(alphaBounds(new Uint8ClampedArray(4 * 4 * 4), 4, 4)).toBeNull();
  });
});

describe("stickerScale", () => {
  it("never upscales small objects", () => {
    expect(stickerScale(100, 80)).toBe(1);
  });
  it("shrinks large objects so the outlined sticker fits", () => {
    const s = stickerScale(1000, 600);
    expect(s).toBeLessThan(1);
    expect(1000 * s + 2 * (WHITE_BORDER + DARK_LINE + TRIM_SLACK)).toBeLessThanOrEqual(STICKER_MAX);
  });
});

describe("stickerLayout", () => {
  it("keeps small boxes at full resolution", () => {
    const l = stickerLayout(200, 100);
    expect(l.scale).toBe(1);
    expect(l.outW).toBeGreaterThan(200);
    expect(l.outH).toBeGreaterThan(100);
  });
  it("caps the longest trimmed side at STICKER_MAX", () => {
    for (const [w, h] of [[1000, 600], [300, 1200], [2000, 2000]] as const) {
      const l = stickerLayout(w, h);
      // trimmed output is the working canvas minus fully transparent margins,
      // so it can only be smaller than the working canvas
      expect(Math.max(l.outW, l.outH)).toBeLessThanOrEqual(STICKER_MAX + 1);
    }
  });
  it("pads enough room for the full die-cut border", () => {
    const l = stickerLayout(400, 300);
    expect(l.pad * l.scale).toBeGreaterThanOrEqual(WHITE_BORDER + DARK_LINE);
  });
  it("guards degenerate boxes", () => {
    const l = stickerLayout(0, -5);
    expect(l.outW).toBeGreaterThanOrEqual(1);
    expect(l.outH).toBeGreaterThanOrEqual(1);
    expect(l.scale).toBe(1);
  });
});

describe("roundedBoxRadius", () => {
  it("scales with the shorter side", () => {
    expect(roundedBoxRadius(100, 200)).toBeCloseTo(18);
    expect(roundedBoxRadius(0, 50)).toBe(0);
  });
});
