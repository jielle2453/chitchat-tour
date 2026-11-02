import { describe, expect, it } from "vitest";
import { alphaBounds, stickerScale, STICKER_MAX } from "./sticker";

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
    expect(s).toBeLessThan(0.4);
    expect(1000 * s + 2 * 16).toBeLessThanOrEqual(STICKER_MAX);
  });
});
