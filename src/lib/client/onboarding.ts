// Pure helpers for the entrance (onboarding) choices. No browser APIs here.

// Default simulated route: the Yongkang Street walk in Taipei.
export const YONGKANG_ROUTE_ID = "yongkang";

// Pick the route a simulated walk should use: keep the stored one when it
// still exists, otherwise fall back to Yongkang, then the first available.
export function resolveOnboardingRouteId(current: string | null, availableIds: string[]): string {
  if (current && availableIds.includes(current)) return current;
  if (availableIds.includes(YONGKANG_ROUTE_ID)) return YONGKANG_ROUTE_ID;
  return availableIds[0] ?? YONGKANG_ROUTE_ID;
}
