import { describe, expect, it } from "vitest";
import { parseRouteParams } from "./route";

const params = (q: string) => new URLSearchParams(q);

describe("parseRouteParams", () => {
  it("parses from/to, defaults, and the alternatives+hometown options", () => {
    const ok = parseRouteParams(params("from=25.033,121.53&to=25.04,121.536&lang=ja&alternatives=1&hometown=JP"));
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.from).toEqual([25.033, 121.53]);
      expect(ok.data.to).toEqual([25.04, 121.536]);
      expect(ok.data.alternatives).toBe("1");
      expect(ok.data.hometown).toBe("JP");
    }
    const minimal = parseRouteParams(params("from=25.033,121.53&to=25.04,121.536"));
    expect(minimal.success).toBe(true);
    if (minimal.success) {
      expect(minimal.data.alternatives).toBeUndefined();
      expect(minimal.data.hometown).toBeUndefined();
    }
  });
  it("rejects bad coordinates, alternatives and hometown", () => {
    expect(parseRouteParams(params("to=25.04,121.536")).success).toBe(false);
    expect(parseRouteParams(params("from=abc,121.53&to=25.04,121.536")).success).toBe(false);
    expect(parseRouteParams(params("from=25.033,121.53&to=25.04,999")).success).toBe(false);
    expect(parseRouteParams(params("from=25.033,121.53&to=25.04,121.536&alternatives=2")).success).toBe(false);
    expect(parseRouteParams(params("from=25.033,121.53&to=25.04,121.536&hometown=japan")).success).toBe(false);
    expect(parseRouteParams(params("from=25.033,121.53&to=25.04,121.536&lang=fr")).success).toBe(false);
  });
});
