import { describe, expect, it } from "vitest";
import { encodeWav, floatTo16BitPCM, mergeChunks, resampleLinear } from "./wav";

describe("wav helpers", () => {
  it("merges chunks in order", () => {
    const out = mergeChunks([new Float32Array([1, 2]), new Float32Array([3])]);
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });

  it("downsamples 48k to 16k with the right length and averaging", () => {
    const input = new Float32Array(480).fill(0.5);
    const out = resampleLinear(input, 48000, 16000);
    expect(out.length).toBe(160);
    expect(out[10]).toBeCloseTo(0.5);
  });

  it("upsamples by interpolation", () => {
    const out = resampleLinear(new Float32Array([0, 1]), 8000, 16000);
    expect(out.length).toBe(4);
    expect(out[1]).toBeCloseTo(0.5);
  });

  it("clamps and converts to 16-bit", () => {
    const pcm = floatTo16BitPCM(new Float32Array([0, 1, -1, 2, -2]));
    expect(Array.from(pcm)).toEqual([0, 32767, -32768, 32767, -32768]);
  });

  it("writes a valid RIFF/WAVE header", () => {
    const buf = encodeWav(new Float32Array(100), 16000);
    const v = new DataView(buf);
    const tag = (o: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => v.getUint8(o + i)));
    expect(buf.byteLength).toBe(44 + 200);
    expect(tag(0)).toBe("RIFF");
    expect(tag(8)).toBe("WAVE");
    expect(tag(36)).toBe("data");
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(40, true)).toBe(200);
  });
});
