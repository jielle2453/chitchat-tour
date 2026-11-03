import { describe, expect, it } from "vitest";
import { resolveOnboardingRouteId, YONGKANG_ROUTE_ID } from "./onboarding";

describe("resolveOnboardingRouteId", () => {
  it("keeps the stored route when it still exists", () => {
    expect(resolveOnboardingRouteId("jinhua", ["yongkang", "jinhua"])).toBe("jinhua");
  });
  it("falls back to Yongkang when the stored route is gone", () => {
    expect(resolveOnboardingRouteId("old-route", ["yongkang", "jinhua"])).toBe("yongkang");
    expect(resolveOnboardingRouteId(null, ["yongkang", "jinhua"])).toBe("yongkang");
  });
  it("falls back to the first route when Yongkang is unavailable", () => {
    expect(resolveOnboardingRouteId(null, ["jinhua"])).toBe("jinhua");
  });
  it("falls back to Yongkang when no routes are available", () => {
    expect(resolveOnboardingRouteId(null, [])).toBe(YONGKANG_ROUTE_ID);
  });
});
