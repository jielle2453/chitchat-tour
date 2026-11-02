import { describe, expect, it } from "vitest";
import { averageCornerColor, dilateAlphaMask, edgeKeyOutAlpha, featherAlphaEdge, type PixelImage } from "./dieCut";

function makeImg(w: number, h: number, fill: [number, number, number, number] = [0, 0, 0, 0]): PixelImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = fill[0];
    data[i * 4 + 1] = fill[1];
    data[i * 4 + 2] = fill[2];
    data[i * 4 + 3] = fill[3];
  }
  return { width: w, height: h, data };
}

function setPx(img: PixelImage, x: number, y: number, r: number, g: number, b: number, a = 255): void {
  const i = (y * img.width + x) * 4;
  img.data[i] = r;
  img.data[i + 1] = g;
  img.data[i + 2] = b;
  img.data[i + 3] = a;
}

function alphaAt(img: PixelImage, x: number, y: number): number {
  return img.data[(y * img.width + x) * 4 + 3];
}

const BG: [number, number, number, number] = [242, 242, 240, 255];

describe("edgeKeyOutAlpha", () => {
  it("keys out the edge background but keeps an enclosed interior white", () => {
    // 7x7: bg everywhere, a dark ring at inset 1, white interior 3x3 ("bowl").
    const img = makeImg(7, 7, BG);
    for (let k = 1; k <= 5; k++) {
      setPx(img, k, 1, 30, 30, 30);
      setPx(img, k, 5, 30, 30, 30);
      setPx(img, 1, k, 30, 30, 30);
      setPx(img, 5, k, 30, 30, 30);
    }
    for (let y = 2; y <= 4; y++) for (let x = 2; x <= 4; x++) setPx(img, x, y, 255, 255, 255);
    edgeKeyOutAlpha(img);
    // outer background gone
    expect(alphaAt(img, 0, 0)).toBe(0);
    expect(alphaAt(img, 6, 3)).toBe(0);
    expect(alphaAt(img, 0, 6)).toBe(0);
    // ring and interior stay
    expect(alphaAt(img, 3, 1)).toBe(255);
    expect(alphaAt(img, 3, 3)).toBe(255);
    expect(alphaAt(img, 2, 4)).toBe(255);
  });

  it("keys out connected background but keeps enclosed art", () => {
    const img = makeImg(4, 4, [20, 60, 120, 255]);
    setPx(img, 1, 1, 200, 30, 30);
    setPx(img, 2, 1, 200, 30, 30);
    setPx(img, 1, 2, 200, 30, 30);
    setPx(img, 2, 2, 200, 30, 30);
    edgeKeyOutAlpha(img);
    expect(alphaAt(img, 0, 0)).toBe(0);
    expect(alphaAt(img, 3, 2)).toBe(0);
    expect(alphaAt(img, 1, 1)).toBe(255);
    expect(alphaAt(img, 2, 2)).toBe(255);
  });
});

describe("averageCornerColor", () => {
  it("ignores transparent corners", () => {
    const img = makeImg(4, 4, [10, 20, 30, 255]);
    setPx(img, 0, 0, 0, 0, 0, 0);
    const [r, g, b] = averageCornerColor(img);
    expect([Math.round(r), Math.round(g), Math.round(b)]).toEqual([10, 20, 30]);
  });
});

describe("featherAlphaEdge", () => {
  it("gives transparent neighbours of art a partial alpha", () => {
    const img = makeImg(3, 3, [0, 0, 0, 0]);
    setPx(img, 1, 1, 200, 100, 50);
    featherAlphaEdge(img);
    expect(alphaAt(img, 1, 1)).toBe(255);
    expect(alphaAt(img, 1, 0)).toBeGreaterThan(0);
    expect(alphaAt(img, 1, 0)).toBeLessThan(255);
    expect(alphaAt(img, 0, 0)).toBe(0); // diagonal, untouched
  });
});

describe("dilateAlphaMask", () => {
  it("dilates one pixel into a disk", () => {
    const alpha = new Uint8Array(25);
    alpha[12] = 255; // center of 5x5
    const out = dilateAlphaMask(alpha, 5, 5, 1);
    // Euclidean disk r=1: plus shape, not the diagonals
    const on: Array<[number, number]> = [
      [2, 2],
      [1, 2],
      [3, 2],
      [2, 1],
      [2, 3],
    ];
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const want = on.some(([ox, oy]) => ox === x && oy === y) ? 1 : 0;
        expect(out[y * 5 + x]).toBe(want);
      }
    }
  });

  it("radius 0 is the identity mask", () => {
    const alpha = new Uint8Array([255, 0, 200, 10]);
    expect(Array.from(dilateAlphaMask(alpha, 2, 2, 0))).toEqual([1, 0, 1, 0]);
  });
});
