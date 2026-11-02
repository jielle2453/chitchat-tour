import { describe, expect, it } from "vitest";
import { expandBox, fitWithin, pixelBlockSize } from "./image";

describe("image helpers", () => {
  it("downscales the longest side to the max", () => {
    expect(fitWithin(4000, 3000, 1280)).toMatchObject({ width: 1280, height: 960 });
    expect(fitWithin(3000, 4000, 1280)).toMatchObject({ width: 960, height: 1280 });
  });

  it("never upscales", () => {
    expect(fitWithin(800, 600, 1280)).toEqual({ width: 800, height: 600, scale: 1 });
  });

  it("expands boxes by 30% and clamps to the image", () => {
    expect(expandBox([100, 100, 200, 200], 0.3, 1000, 1000)).toEqual([70, 70, 230, 230]);
    expect(expandBox([0, 0, 100, 100], 0.3, 110, 110)).toEqual([0, 0, 110, 110]);
  });

  it("uses a minimum pixel block size", () => {
    expect(pixelBlockSize([0, 0, 20, 20])).toBe(6);
    expect(pixelBlockSize([0, 0, 120, 120])).toBe(20);
  });
});
