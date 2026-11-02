import { afterEach, describe, expect, it } from "vitest";
import type { KnowledgeItem } from "@/lib/types";
import { scaleBox1000, toPromptBox, transformPath } from "./boxes";
import { parseSamOutput } from "./sam";
import { parseSparkText } from "./spark";
import { analyzePhoto, matchItem } from "./index";

const SAM_TEXT =
  "<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334|>" +
  "<|mask;x=0;y=0;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>" +
  ",1<|box;x1=155;y1=228;x2=202;y2=254;w=320;h=334|>" +
  "<|mask;x=0;y=0;data=27,48,~!!!!J!0c[q=Pj_zs=*4C4(/./x#:/`S_GnD`=o3?X{emCgO$y@|>\n";

describe("box helpers", () => {
  it("scales 0-1000 boxes to pixels and sorts corners", () => {
    expect(scaleBox1000([100, 200, 500, 800], 1280, 960)).toEqual([128, 192, 640, 768]);
    expect(scaleBox1000([500, 800, 100, 200], 1280, 960)).toEqual([128, 192, 640, 768]);
    expect(scaleBox1000([0, 0, 2000, 1000], 100, 100)).toEqual([0, 0, 100, 100]);
    expect(scaleBox1000([10, 10, 10, 10], 100, 100)).toBeNull();
    expect(scaleBox1000([1, 2, 3], 100, 100)).toBeNull();
  });

  it("keeps prompt boxes inside the image", () => {
    expect(toPromptBox([-5, 0, 400, 300], 400, 300)).toEqual({ left: 0, top: 0, right: 399, bottom: 299 });
  });

  it("transforms path coordinates in pairs", () => {
    expect(transformPath("M0 0L2 1Z", 2, 2, 10, 20)).toBe("M10 20L14 22Z");
  });
});

describe("SAM output parsing", () => {
  it("parses boxes (half-open) and mask outlines in image space", async () => {
    const objs = await parseSamOutput(SAM_TEXT);
    expect(objs.map((o) => o.id)).toEqual(["0", "1"]);
    expect(objs[0].box).toEqual([211, 228, 271, 255]);
    expect(objs[1].box).toEqual([155, 228, 203, 255]);
    expect(objs[0].maskSvgPath).toMatch(/^M/);
    const nums = objs[0].maskSvgPath!.match(/-?\d+(\.\d+)?/g)!.map(Number);
    for (let i = 0; i < nums.length; i += 2) {
      expect(nums[i]).toBeGreaterThanOrEqual(210);
      expect(nums[i]).toBeLessThanOrEqual(272);
      expect(nums[i + 1]).toBeGreaterThanOrEqual(227);
      expect(nums[i + 1]).toBeLessThanOrEqual(256);
    }
  });

  it("returns nothing for an empty response", async () => {
    expect(await parseSamOutput("")).toEqual([]);
  });
});

describe("Spark output parsing", () => {
  it("converts structured JSON to pixel boxes and drops bad ones", () => {
    const text = JSON.stringify({
      objects: [
        { label: " scooter ", box: [500, 500, 1000, 1000] },
        { label: "bad", box: [1, 2, 3] },
      ],
    });
    expect(parseSparkText(text, 200, 100)).toEqual([{ label: "scooter", box: [100, 50, 200, 100] }]);
  });
});

describe("matching and mock mode", () => {
  const items = [
    { id: "pole", trigger: { osm: [], photo_concepts: ["Utility Pole"] } },
    { id: "bike", trigger: { osm: [] } },
  ] as unknown as KnowledgeItem[];

  it("matches labels to photo concepts case-insensitively", () => {
    expect(matchItem("utility pole with transformer", items)).toBe("pole");
    expect(matchItem("pole", items)).toBe("pole");
    expect(matchItem("scooter", items)).toBeUndefined();
  });

  const saved = process.env.META_API_KEY;
  afterEach(() => {
    if (saved === undefined) delete process.env.META_API_KEY;
    else process.env.META_API_KEY = saved;
  });

  it("returns scaled canned objects without calling the network", async () => {
    delete process.env.META_API_KEY;
    const res = await analyzePhoto(
      { profile: { hometown: "JP", lang: "en" }, imageDataUrl: "data:image/jpeg;base64,AA", width: 1000, height: 500 },
      items,
    );
    expect(res.objects.length).toBeGreaterThanOrEqual(3);
    expect(res.personBoxes).toEqual([]);
    for (const o of res.objects) {
      expect(o.box[2]).toBeLessThanOrEqual(1000);
      expect(o.box[3]).toBeLessThanOrEqual(500);
    }
    expect(res.objects[0].itemId).toBe("pole");
    expect(res.trace.length).toBeGreaterThan(0);
  });
});
