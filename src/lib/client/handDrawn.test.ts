import { describe, expect, it } from "vitest";
import { clipStreets, collageDurationMs, fitMeterFrame, fractionsAlongRoute, hashSeed, jitterPoints, layoutCollageStickers, layoutMapStickers, leaderCrossesRoute, meterFrame, mulberry32, projectGeo, toPathD, walkBbox, type CollageOpts, type StreetGeom } from "./handDrawn";

const street = (id: string, name: string, highway: string, coords: [number, number][]): StreetGeom => ({ id, name, highway, coordinates: coords });

describe("seeded random", () => {
  it("is deterministic", () => {
    expect(hashSeed("永康街")).toBe(hashSeed("永康街"));
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe("jitterPoints", () => {
  it("keeps endpoints fixed and is deterministic", () => {
    const pts: [number, number][] = [
      [0, 0],
      [50, 0],
      [100, 5],
    ];
    const a = jitterPoints(pts, "walk-1");
    const b = jitterPoints(pts, "walk-1");
    expect(a).toEqual(b);
    expect(a[0]).toEqual([0, 0]);
    expect(a[a.length - 1]).toEqual(pts[pts.length - 1]);
    // interior points actually wobble
    expect(a.some((p, i) => i > 0 && i < a.length - 1 && p[1] !== 0)).toBe(true);
    expect(jitterPoints(pts, "other-seed")).not.toEqual(a);
  });
  it("makes a path string", () => {
    expect(toPathD([[0, 0], [1, 2]])).toBe("M0.0,0.0 L1.0,2.0");
  });
});

describe("walkBbox + clipStreets", () => {
  it("pads the walk and never collapses", () => {
    const b = walkBbox([[25.033, 121.529], [25.03, 121.53]]);
    expect(b.minLat).toBeLessThan(25.03);
    expect(b.maxLon).toBeGreaterThan(121.53);
    const straight = walkBbox([[25.03, 121.529], [25.03, 121.5295]]);
    expect(straight.maxLat - straight.minLat).toBeGreaterThan(0);
    expect(straight.maxLon - straight.minLon).toBeGreaterThan(0);
  });
  it("keeps named streets in the box, drops alleys, caps the count", () => {
    const bbox = { minLat: 25.02, maxLat: 25.04, minLon: 121.52, maxLon: 121.54 };
    const streets = [
      street("1", "永康街", "residential", [[121.529, 25.03], [121.529, 25.033]]),
      street("2", "小巷", "service", [[121.529, 25.03], [121.53, 25.031]]),
      street("3", "", "residential", [[121.529, 25.03], [121.53, 25.031]]),
      street("4", "遠方街", "tertiary", [[121.6, 25.1], [121.61, 25.11]]),
      street("5", "步道", "footway", [[121.529, 25.03], [121.53, 25.031]]),
    ];
    const kept = clipStreets(streets, bbox, 10);
    expect(kept.map((s) => s.name)).toEqual(["永康街"]);
    const many = Array.from({ length: 60 }, (_, i) => street(`${i}`, `街${i}`, "residential", [[121.529, 25.03], [121.5295, 25.033]]));
    expect(clipStreets(many, bbox, 36)).toHaveLength(36);
  });
  it("projects inside the sheet", () => {
    const bbox = walkBbox([[25.033, 121.529], [25.03, 121.53]]);
    for (const [lat, lon] of [[25.033, 121.529], [25.03, 121.53], [25.0315, 121.5295]]) {
      const [x, y] = projectGeo(lat, lon, bbox, 360, 400);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(360);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(400);
    }
  });
});

describe("fractionsAlongRoute", () => {
  it("grows along a straight walk", () => {
    const route: [number, number][] = [
      [25.0, 121.0],
      [25.01, 121.0],
      [25.02, 121.0],
    ];
    const f = fractionsAlongRoute(route, [
      { lat: 25.0, lon: 121.0 },
      { lat: 25.01, lon: 121.0 },
      { lat: 25.02, lon: 121.0 },
    ]);
    expect(f[0]).toBeCloseTo(0, 3);
    expect(f[1]).toBeCloseTo(0.5, 3);
    expect(f[2]).toBeCloseTo(1, 3);
  });
  it("is monotonic along the walk and clamps off-route points", () => {
    // L-shaped walk: north, then east.
    const route: [number, number][] = [
      [25.0, 121.0],
      [25.01, 121.0],
      [25.01, 121.01],
    ];
    const f = fractionsAlongRoute(route, [
      { lat: 25.0, lon: 121.0 },
      { lat: 25.005, lon: 121.0 },
      { lat: 25.01, lon: 121.0 },
      { lat: 25.01, lon: 121.005 },
      { lat: 25.01, lon: 121.01 },
    ]);
    for (let i = 1; i < f.length; i++) expect(f[i]).toBeGreaterThanOrEqual(f[i - 1] - 1e-9);
    expect(f[0]).toBeCloseTo(0, 3);
    expect(f[f.length - 1]).toBeCloseTo(1, 3);
    // Far off-route still lands in 0..1 (nearest-segment projection).
    const [off] = fractionsAlongRoute(route, [{ lat: 26.0, lon: 122.0 }]);
    expect(off).toBeGreaterThanOrEqual(0);
    expect(off).toBeLessThanOrEqual(1);
  });
});

describe("meterFrame + fitMeterFrame", () => {
  it("keeps aspect with cos(lat) correction and fits the rect", () => {
    const bbox = walkBbox([
      [25.033, 121.529],
      [25.03, 121.53],
    ]);
    const m = meterFrame(bbox);
    expect(m.sx).toBeGreaterThan(0);
    expect(m.sy).toBeGreaterThan(0);
    const rect = { x: 100, y: 100, w: 180, h: 500 };
    const { scale, project } = fitMeterFrame(m, rect);
    expect(scale).toBeGreaterThan(0);
    for (const [lat, lon] of [
      [25.033, 121.529],
      [25.03, 121.53],
    ]) {
      const [x, y] = project(lat, lon);
      expect(x).toBeGreaterThanOrEqual(rect.x - 1e-6);
      expect(x).toBeLessThanOrEqual(rect.x + rect.w + 1e-6);
      expect(y).toBeGreaterThanOrEqual(rect.y - 1e-6);
      expect(y).toBeLessThanOrEqual(rect.y + rect.h + 1e-6);
    }
  });
});

describe("collageDurationMs", () => {
  it("grows with sticker count inside the clamp", () => {
    expect(collageDurationMs(0)).toBe(2500);
    expect(collageDurationMs(2)).toBe(2700);
    expect(collageDurationMs(6)).toBe(1800 + 450 * 6);
    expect(collageDurationMs(100)).toBe(6000);
  });
});

const collageOpts = (h = 700): CollageOpts => ({
  size: 92,
  w: 380,
  h,
  bandX0: 380 * 0.27,
  bandX1: 380 * 0.73,
  topPad: 100,
  bottomPad: 64,
  labelH: 34,
  gap: 10,
  edgeGap: 8,
});

describe("leaderCrossesRoute", () => {
  it("spots a leader cutting across the route", () => {
    const route: [number, number][] = [
      [190, 100],
      [190, 600],
    ];
    // left box to left point: same side, no crossing
    expect(leaderCrossesRoute(route, 96, 300, 120, 300)).toBe(false);
    // right box to left point: spans the whole band, crosses the line
    expect(leaderCrossesRoute(route, 284, 300, 120, 300)).toBe(true);
    // short leader landing on the line: only touches its own endpoint
    expect(leaderCrossesRoute(route, 184, 300, 190, 300)).toBe(false);
  });
});

describe("layoutCollageStickers", () => {
  it("uses the point's own side at the same height and stays inside the sheet", () => {
    const o = collageOpts();
    const [left, right] = layoutCollageStickers(
      [
        { id: "a", rx: 120, ry: 300 }, // left of centre -> left column
        { id: "b", rx: 260, ry: 300 }, // right of centre -> right column
      ],
      o,
    );
    expect(left.side).toBe("left");
    expect(right.side).toBe("right");
    // same height as the route point (y = point y - art/2)
    expect(left.y).toBeCloseTo(300 - 92 / 2, 6);
    expect(right.y).toBeCloseTo(300 - 92 / 2, 6);
    for (const s of [left, right]) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x + 92).toBeLessThanOrEqual(380);
      expect(s.y).toBeGreaterThanOrEqual(o.topPad);
      expect(s.y + 92 + o.labelH).toBeLessThanOrEqual(o.h);
      expect(Math.abs(s.rot)).toBeLessThanOrEqual(8);
      expect(Math.abs(s.tapeRot)).toBeGreaterThanOrEqual(12);
      expect(Math.abs(s.tapeRot)).toBeLessThanOrEqual(20);
      expect(Math.abs(s.labelRot)).toBeLessThanOrEqual(2);
      // leader endpoint sits on the art-box edge
      const onEdgeX = s.lx === s.x || s.lx === s.x + 92 || (s.lx > s.x && s.lx < s.x + 92);
      const onEdgeY = s.ly === s.y || s.ly === s.y + 92 || (s.ly > s.y && s.ly < s.y + 92);
      expect(onEdgeX && onEdgeY).toBe(true);
      // near-horizontal leader on the sticker's own side
      expect(Math.abs(s.ly - s.ry)).toBeLessThanOrEqual(92 / 2 + 1);
    }
    // deterministic
    expect(layoutCollageStickers([{ id: "a", rx: 120, ry: 300 }], o)).toEqual([
      layoutCollageStickers(
        [
          { id: "a", rx: 120, ry: 300 },
          { id: "b", rx: 260, ry: 300 },
        ],
        o,
      )[0],
    ]);
  });
  it("stacks same-side stickers: art never overlaps, labels give up to 24px", () => {
    const o = collageOpts();
    // Six discoveries met at almost the same route point, half on each side.
    const anchors = Array.from({ length: 6 }, (_, i) => ({
      id: `d-${i}`,
      rx: i % 2 === 0 ? 130 : 250,
      ry: 350,
    }));
    const placed = layoutCollageStickers(anchors, o);
    expect(placed).toHaveLength(6);
    const art = (s: (typeof placed)[number]) => ({ x0: s.x, y0: s.y, x1: s.x + 92, y1: s.y + 92 });
    const lab = (s: (typeof placed)[number]) => ({ x0: s.x, y0: s.y + 92, x1: s.x + 92, y1: s.y + 92 + o.labelH });
    const xOver = (a: ReturnType<typeof art>, b: ReturnType<typeof art>) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    const yOver = (a: ReturnType<typeof art>, b: ReturnType<typeof art>) => Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const ai = art(placed[i]);
        const aj = art(placed[j]);
        // art-vs-art never overlaps
        expect(xOver(ai, aj) > 0 && yOver(ai, aj) > 0).toBe(false);
        // art-vs-label penetration is capped at 24px either direction
        for (const [a, b] of [
          [ai, lab(placed[j])],
          [aj, lab(placed[i])],
        ] as const) {
          if (xOver(a, b) > 0) expect(yOver(a, b)).toBeLessThanOrEqual(24);
        }
      }
    }
  });
  it("compresses ±60px before pushing, and never leapfrogs in y", () => {
    const o = collageOpts();
    const a = layoutCollageStickers(
      [
        { id: "a", rx: 120, ry: 300 },
        { id: "b", rx: 120, ry: 420 },
      ],
      o,
    );
    // Targets 120px apart: b compresses to just below a instead of flipping.
    expect(a[0]).toMatchObject({ side: "left", y: 254 });
    expect(a[1].side).toBe("left");
    expect(a[1].y).toBe(392);
    // Scrambled input order: same-side stickers keep target-y order on screen.
    const scrambled = layoutCollageStickers(
      [
        { id: "s0", rx: 120, ry: 500 },
        { id: "s1", rx: 120, ry: 200 },
        { id: "s2", rx: 120, ry: 350 },
      ],
      o,
    );
    const lefts = scrambled.filter((s) => s.side === "left").sort((p, q) => p.ry - q.ry);
    for (let i = 1; i < lefts.length; i++) expect(lefts[i].y).toBeGreaterThanOrEqual(lefts[i - 1].y);
  });
  it("keeps every leader short, near-horizontal and off the route", () => {
    const o = collageOpts();
    const route: [number, number][] = [
      [190, 100],
      [190, 600],
    ];
    // A realistic spread: discoveries along the walk, alternating sides.
    const anchors = [150, 240, 330, 420, 510, 590].map((ry, i) => ({
      id: `w-${i}`,
      rx: i % 2 === 0 ? 120 : 260,
      ry,
    }));
    const placed = layoutCollageStickers(anchors, { ...o, routePts: route });
    expect(placed).toHaveLength(6);
    for (const s of placed) {
      // home side, roughly at the route point's height
      expect(s.side).toBe(s.rx < 190 ? "left" : "right");
      expect(Math.abs(s.y + 92 / 2 - s.ry)).toBeLessThanOrEqual(60);
      const len = Math.hypot(s.lx - s.rx, s.ly - s.ry);
      expect(len).toBeLessThanOrEqual(140); // a longer leader is a layout failure
      expect(leaderCrossesRoute(route, s.lx, s.ly, s.rx, s.ry)).toBe(false);
    }
  });
  it("flips to the far side past ~80px of push, unless the leader would cross", () => {
    const o = collageOpts();
    const pair = [
      { id: "a", rx: 170, ry: 300 },
      { id: "b", rx: 170, ry: 310 },
    ];
    // No route to guard against: the crowded second sticker flips right
    // (114px leader, within budget).
    const flipped = layoutCollageStickers(pair, o);
    expect(flipped[0].side).toBe("left");
    expect(flipped[1].side).toBe("right");
    // With a centre route in the way, the flip would cross it: keep pushing left.
    const guarded = layoutCollageStickers(pair, {
      ...o,
      routePts: [
        [190, 100],
        [190, 600],
      ],
    });
    expect(guarded[1].side).toBe("left");
    expect(guarded[1].y).toBeGreaterThan(flipped[1].y);
  });
  it("pins a sticker home when every slot needs a >140px leader", () => {
    const o = collageOpts();
    // Two discoveries at the same route point: the second can't sit beside
    // the first, and the far side is a 164px leader away — so it stays home
    // near its target instead of flipping across the sheet.
    const placed = layoutCollageStickers(
      [
        { id: "a", rx: 120, ry: 300 },
        { id: "b", rx: 120, ry: 300 },
      ],
      o,
    );
    expect(placed[1].side).toBe("left");
    const len = Math.hypot(placed[1].lx - 120, placed[1].ly - 300);
    expect(len).toBeLessThanOrEqual(140);
  });
});

describe("layoutMapStickers", () => {
  it("separates overlapping anchors and stays inside the sheet", () => {
    const anchors = Array.from({ length: 6 }, (_, i) => ({ id: `d-${i}`, x: 180, y: 200 }));
    const placed = layoutMapStickers(anchors, 56, 360, 420);
    expect(placed).toHaveLength(6);
    for (const p of placed) {
      expect(p.x).toBeGreaterThanOrEqual(28);
      expect(p.x).toBeLessThanOrEqual(332);
      expect(p.y).toBeGreaterThanOrEqual(28);
      expect(p.y).toBeLessThanOrEqual(392);
      expect(Math.abs(p.rot)).toBeLessThanOrEqual(7);
    }
    let minD = Infinity;
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) minD = Math.min(minD, Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y));
    }
    expect(minD).toBeGreaterThan(20);
    // deterministic
    expect(layoutMapStickers(anchors, 56, 360, 420)).toEqual(placed);
  });
});
