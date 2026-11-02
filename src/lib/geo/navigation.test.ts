import { describe, expect, it } from "vitest";
import type { Poi, RouteStep, WalkRoute } from "@/lib/types";
import {
  isOffRoute,
  navCue,
  poisAlongRoute,
  progressOnRoute,
  routeToRouteDef,
} from "./navigation";

// L-shaped fixture near Dongmen: A -> B south (~89 m), B -> C east (~71 m).
const A: [number, number] = [121.5299, 25.0338];
const B: [number, number] = [121.5299, 25.033];
const C: [number, number] = [121.5306, 25.033];

function fixtureRoute(): WalkRoute {
  return {
    coordinates: [A, B, C],
    distanceM: 160,
    durationS: 123,
    steps: [
      { type: "depart", location: A, name: "Yongkang Street", distanceM: 89 },
      { type: "turn", modifier: "right", location: B, name: "Lane 31", distanceM: 71 },
      { type: "arrive", location: C, name: "", distanceM: 0 },
    ],
  };
}

const poi = (id: string, lat: number, lon: number): Poi => ({
  id,
  kind: "other",
  name: id,
  lat,
  lon,
  tags: {},
});

describe("progressOnRoute", () => {
  it("starts at zero and points at the first turn", () => {
    const p = progressOnRoute(fixtureRoute(), { lat: A[1], lon: A[0] });
    expect(p.distanceAlongM).toBeCloseTo(0, 1);
    expect(p.offRouteM).toBeLessThan(1);
    expect(p.nextStepIndex).toBe(1);
    expect(p.distanceToNextStepM).toBeGreaterThan(80);
    expect(p.distanceToNextStepM).toBeLessThan(95);
    expect(p.remainingM).toBeGreaterThan(150);
    expect(p.remainingM).toBeLessThan(170);
  });

  it("tracks the midpoint of the first leg", () => {
    const p = progressOnRoute(fixtureRoute(), { lat: 25.0334, lon: 121.5299 });
    expect(p.distanceAlongM).toBeGreaterThan(35);
    expect(p.distanceAlongM).toBeLessThan(55);
    expect(p.offRouteM).toBeLessThan(2);
    expect(p.nextStepIndex).toBe(1);
  });

  it("advances to the arrive step near the end", () => {
    const p = progressOnRoute(fixtureRoute(), { lat: 25.033, lon: 121.5304 });
    expect(p.nextStepIndex).toBe(2);
    expect(p.distanceToNextStepM).toBeLessThan(25);
    expect(p.remainingM).toBeLessThan(25);
  });

  it("measures off-route distance for a far fix", () => {
    const p = progressOnRoute(fixtureRoute(), { lat: 25.0334, lon: 121.533 });
    expect(p.offRouteM).toBeGreaterThan(100);
    expect(isOffRoute(p)).toBe(true);
    expect(isOffRoute(p, 300)).toBe(false);
  });

  it("handles degenerate routes without crashing", () => {
    expect(progressOnRoute({ coordinates: [], distanceM: 0, durationS: 0, steps: [] }, { lat: 25, lon: 121 }).remainingM).toBe(0);
    const single: WalkRoute = { coordinates: [A], distanceM: 0, durationS: 0, steps: [] };
    const p = progressOnRoute(single, { lat: A[1], lon: A[0] });
    expect(p.distanceAlongM).toBe(0);
    expect(p.remainingM).toBe(0);
  });
});

describe("isOffRoute", () => {
  it("uses a 35 m default threshold", () => {
    const base = { distanceAlongM: 0, remainingM: 0, nextStepIndex: 0, distanceToNextStepM: 0 };
    expect(isOffRoute({ ...base, offRouteM: 34.9 })).toBe(false);
    expect(isOffRoute({ ...base, offRouteM: 35.1 })).toBe(true);
  });
});

describe("navCue", () => {
  const step = (s: Partial<RouteStep>): RouteStep => ({
    type: "turn",
    location: B,
    name: "",
    distanceM: 10,
    ...s,
  });

  it("speaks depart / turn / arrive in all three demo languages", () => {
    expect(navCue(step({ type: "depart", name: "Yongkang Street" }), "en")).toBe("Head out onto Yongkang Street.");
    expect(navCue(step({ type: "depart", name: "永康街" }), "zh-TW")).toBe("沿永康街出發。");
    expect(navCue(step({ type: "depart", name: "永康街" }), "ja")).toBe("永康街へ出発です。");

    expect(navCue(step({ type: "turn", modifier: "right", name: "Yongkang Street" }), "en")).toBe(
      "Turn right ahead onto Yongkang Street.",
    );
    expect(navCue(step({ type: "turn", modifier: "right", name: "永康街" }), "zh-TW")).toBe("前面右轉，進永康街。");
    expect(navCue(step({ type: "turn", modifier: "right", name: "永康街" }), "ja")).toBe("この先を右です、永康街へ。");

    expect(navCue(step({ type: "arrive", modifier: "right" }), "zh-TW")).toBe("到了，目的地就在右邊。");
    expect(navCue(step({ type: "arrive", modifier: "right" }), "ja")).toBe("到着です、目的地は右側です。");
    expect(navCue(step({ type: "arrive", modifier: "right" }), "en")).toBe(
      "You have arrived — the destination is on your right.",
    );
  });

  it("stays silent for continue-straight and notifications", () => {
    expect(navCue(step({ type: "continue", modifier: "straight", name: "Xinyi Rd" }), "en")).toBe("");
    expect(navCue(step({ type: "continue", name: "Xinyi Rd" }), "zh-TW")).toBe("");
    expect(navCue(step({ type: "notification", name: "Xinyi Rd" }), "ja")).toBe("");
  });

  it("speaks non-straight continues, new names and end of road", () => {
    expect(navCue(step({ type: "continue", modifier: "slight left", name: "Ln 10" }), "en")).toBe(
      "Turn slight left ahead onto Ln 10.",
    );
    expect(navCue(step({ type: "new name", name: "金山南路" }), "zh-TW")).toBe("直走進入金山南路。");
    expect(navCue(step({ type: "new name", name: "" }), "en")).toBe("");
    expect(navCue(step({ type: "end of road", modifier: "left", name: "信義路" }), "zh-TW")).toBe(
      "到底後左轉，進信義路。",
    );
  });

  it("handles fork, roundabout, ramp and uturn", () => {
    expect(navCue(step({ type: "fork", modifier: "slight right", name: "Alley 2" }), "en")).toBe(
      "Keep slight right at the fork onto Alley 2.",
    );
    expect(navCue(step({ type: "roundabout", name: "Roosevelt Rd" }), "en")).toBe(
      "At the roundabout, take the exit onto Roosevelt Rd.",
    );
    expect(navCue(step({ type: "roundabout", name: "" }), "zh-TW")).toBe("進入圓環。");
    expect(navCue(step({ type: "turn", modifier: "uturn", name: "" }), "zh-TW")).toBe("前面迴轉。");
    expect(navCue(step({ type: "turn", modifier: "left", name: "" }), "ja")).toBe("この先を左です。");
  });

  it("falls back to a generic continue for unknown types with a name", () => {
    expect(navCue(step({ type: "mystery", name: "Foo Rd" }), "en")).toBe("Continue onto Foo Rd.");
    expect(navCue(step({ type: "mystery", name: "" }), "en")).toBe("");
  });
});

describe("routeToRouteDef", () => {
  it("wraps the computed route for the simulated source", () => {
    const def = routeToRouteDef(fixtureRoute(), "Dongmen Market");
    expect(def.id).toBe("destination");
    expect(def.name.en).toBe("Dongmen Market");
    expect(def.coordinates).toEqual([A, B, C]);
  });
});

describe("poisAlongRoute", () => {
  it("returns corridor POIs ordered by distance along the route", () => {
    const nearStart = poi("start", 25.0337, 121.52995);
    const nearEnd = poi("end", 25.03302, 121.5305);
    const far = poi("far", 25.035, 121.532);
    const out = poisAlongRoute(fixtureRoute(), [nearEnd, far, nearStart]);
    expect(out.map((p) => p.id)).toEqual(["start", "end"]);
    expect(out[0].distanceM).toBeLessThan(40);
    expect(out[0].distanceAlongM).toBeLessThan(out[1].distanceAlongM);
  });

  it("respects a custom corridor width", () => {
    const at30m = poi("edge", 25.0334, 121.5302); // ~30 m east of leg AB
    expect(poisAlongRoute(fixtureRoute(), [at30m], 20)).toHaveLength(0);
    expect(poisAlongRoute(fixtureRoute(), [at30m], 40)).toHaveLength(1);
  });
});
