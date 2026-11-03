import "server-only";
// "Hear more" route options: given the fastest foot route, find an
// alternative that passes more story-worthy places without wandering too
// far (at most ~40% longer, at most +8 min). Candidates come from the
// router's own alternatives plus one route threaded through a dense cluster
// of story-worthy POIs between origin and destination.
import type { HometownStatus, KnowledgeItem, Poi, WalkRoute } from "@/lib/types";
import { getKnowledgeItems } from "@/lib/kb";
import { nearbyPois } from "@/lib/geo";
import { haversineM } from "./math";
import { poisAlongRoute } from "./navigation";
import { fetchNearbyPois } from "./overpass";
import { fetchOsrmRoutes, getRoute } from "./routing";

// POIs within this corridor of a candidate line count as "along the route".
// Matches the phone-side ROUTE_CORRIDOR_M.
export const STORY_CORRIDOR_M = 60;
// A "hear more" route must stay within these of the fastest route...
export const HEAR_MORE_MAX_RATIO = 1.4;
export const HEAR_MORE_MAX_EXTRA_S = 8 * 60;
// ... and offer at least this many more hearable stories to be offered.
export const HEAR_MORE_MIN_GAP = 2;
// The guide tells one story, then stays quiet: ~25 s of narration plus the
// default 15 s quiet gap, so roughly one story per 40 s of walking. The
// story estimate is capped by this pacing.
export const STORY_PACING_S = 40;
// Worth-visiting places with no knowledge trigger are researched live, but
// not every one turns into a story: +1 per pair, bounded.
export const LIVE_DISCOVERY_PER = 2;
export const LIVE_DISCOVERY_CAP = 3;

export interface ScoredRoute {
  route: WalkRoute;
  score: number; // novelty-weighted story matches along the route
  stories: number; // hearable stories along the route (distinct items + live allowance, time-capped)
}

// Novelty weight per knowledge-item hometown status: absent at home outranks
// different, which outranks unknown; same-as-home is kept as light resonance.
const NOVELTY: Record<HometownStatus, number> = {
  absent: 3,
  different: 2,
  unknown: 1,
  same: 0.5,
};

// Matches trigger/poiMatches in src/lib/trigger (key=value against tags,
// bare word against tags and kind). Kept local so the server route does not
// depend on phone modules.
export function poiMatchesTrigger(poi: Poi, patterns: string[]): boolean {
  const tags = new Map<string, string>();
  for (const [k, v] of Object.entries(poi.tags ?? {})) tags.set(k.toLowerCase(), String(v).toLowerCase());
  if (poi.brand) tags.set("brand", poi.brand.toLowerCase());
  const kind = poi.kind.toLowerCase();
  for (const raw of patterns) {
    const p = raw.trim().toLowerCase();
    if (!p) continue;
    const eq = p.indexOf("=");
    if (eq < 0) {
      if (p === kind || tags.has(p)) return true;
      continue;
    }
    const key = p.slice(0, eq);
    const val = p.slice(eq + 1);
    const have = tags.get(key);
    if (have !== undefined && (val === "*" || have === val)) return true;
    if (val === kind) return true;
  }
  return false;
}

// Mirrors worthVisiting in src/lib/client/navEngine: named markets, temples,
// historic sites, parks, museums and the like.
const STORY_TOURISM = new Set(["museum", "gallery", "attraction", "viewpoint", "artwork"]);
const STORY_LEISURE = new Set(["park", "garden", "plaza", "playground"]);

export function isStoryKind(poi: Pick<Poi, "kind" | "tags">): boolean {
  if (poi.kind === "marketplace" || poi.kind === "place_of_worship") return true;
  const tags = poi.tags ?? {};
  const get = (k: string): string => String(tags[k] ?? "").toLowerCase();
  if (get("amenity") === "place_of_worship" || get("amenity") === "marketplace") return true;
  if (get("historic")) return true;
  if (STORY_TOURISM.has(get("tourism"))) return true;
  if (STORY_LEISURE.has(get("leisure"))) return true;
  return false;
}

// Score one candidate: the novelty-weighted score sums each in-corridor
// POI's best knowledge-item weight (0.5 for a worth-visiting place with no
// knowledge trigger) and picks the "hear more" route. The `stories` estimate
// is what a visitor would actually hear: the number of DISTINCT parent-level
// knowledge items with at least one trigger POI in the corridor (facets of
// one parent count once, and each item is told at most once), plus a bounded
// allowance for live-discovery places, capped by walking time. `items`
// defaults to the bundled knowledge base; pass an explicit list in tests.
export function scoreRouteStories(
  route: WalkRoute,
  pois: Poi[],
  items: KnowledgeItem[],
  hometown?: string,
  corridorM: number = STORY_CORRIDOR_M,
): { score: number; stories: number } {
  const onRoute = poisAlongRoute(route, pois, corridorM);
  let score = 0;
  const matched = new Set<string>();
  let liveCands = 0;
  for (const poi of onRoute) {
    let best = 0;
    let bestId: string | null = null;
    for (const item of items) {
      if (item.parent || item.confidence === "low" || !item.sources || item.sources.length === 0) continue;
      if (!item.trigger.osm || item.trigger.osm.length === 0) continue;
      if (!poiMatchesTrigger(poi, item.trigger.osm)) continue;
      const status: HometownStatus = (hometown ? item.hometown?.[hometown]?.status : undefined) ?? "unknown";
      const w = hometown ? NOVELTY[status] : 1;
      if (w > best) {
        best = w;
        bestId = item.id;
      }
    }
    if (best > 0 && bestId) {
      matched.add(bestId);
      score += best;
    } else if (isStoryKind(poi)) {
      // Worth visiting but nothing in the knowledge base: the guide would
      // research it live, which only sometimes becomes a story.
      liveCands += 1;
      score += 0.5;
    }
  }
  const allowance = Math.min(LIVE_DISCOVERY_CAP, Math.floor(liveCands / LIVE_DISCOVERY_PER));
  const cap = Math.max(0, Math.floor(route.durationS / STORY_PACING_S));
  return { score, stories: Math.min(matched.size + allowance, cap) };
}

// Pick the "hear more" route: the best-scoring candidate within the length
// and time budgets that is meaningfully better than the fastest (at least
// HEAR_MORE_MIN_GAP more hearable stories). Null = fastest only.
export function selectHearMore(fastest: ScoredRoute, others: ScoredRoute[]): ScoredRoute | null {
  const ok = others.filter(
    (o) =>
      o.route.distanceM <= fastest.route.distanceM * HEAR_MORE_MAX_RATIO &&
      o.route.durationS - fastest.route.durationS <= HEAR_MORE_MAX_EXTRA_S &&
      o.stories - fastest.stories >= HEAR_MORE_MIN_GAP,
  );
  ok.sort((a, b) => b.score - a.score || a.route.distanceM - b.route.distanceM);
  return ok[0] ?? null;
}

// Two routes are the same path when their lengths nearly agree.
export function sameRoute(a: WalkRoute, b: WalkRoute): boolean {
  if (a.coordinates.length !== b.coordinates.length) return false;
  const d = Math.max(a.distanceM, b.distanceM);
  if (d <= 0) return true;
  return Math.abs(a.distanceM - b.distanceM) / d < 0.01;
}

// POIs that could matter for scoring: the static hand-fetched set around the
// midpoint, topped up with live Overpass results on a short budget.
async function collectPois(from: { lat: number; lon: number }, to: { lat: number; lon: number }): Promise<Poi[]> {
  const mid = { lat: (from.lat + to.lat) / 2, lon: (from.lon + to.lon) / 2 };
  const span = haversineM(from, to);
  const radius = Math.min(2000, Math.max(300, span / 2 + 600));
  const fix = { lat: mid.lat, lon: mid.lon, accuracy: 10, heading: null, speed: null, timestamp: Date.now() };
  const staticPois = nearbyPois(fix, radius);
  let live: Poi[] = [];
  try {
    const timeout = new Promise<Poi[] | null>((resolve) => setTimeout(() => resolve(null), 6000));
    const pois = await Promise.race([fetchNearbyPois(mid.lat, mid.lon, Math.min(500, radius)), timeout]);
    if (pois) {
      live = pois.filter((p) => {
        const d = haversineM(mid, p);
        return d <= Math.min(500, radius) && staticPois.every((s) => s.id !== p.id && haversineM(s, p) > 30);
      });
    }
  } catch {
    live = [];
  }
  return [...staticPois, ...live];
}

// A waypoint at a dense cluster of story-worthy POIs off the fastest line:
// grid cells (~150 m), densest cell with >= 2 story POIs wins, waypoint is
// the cluster POI nearest the cell centroid. Null when there is no cluster.
export function findStoryWaypoint(
  pois: Poi[],
  items: KnowledgeItem[],
  fastest: WalkRoute,
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): { lat: number; lon: number } | null {
  const onFast = new Set(poisAlongRoute(fastest, pois, STORY_CORRIDOR_M).map((p) => p.id));
  const direct = haversineM(from, to);
  const cands = pois.filter((p) => {
    if (onFast.has(p.id)) return false;
    const story = items.some(
      (item) =>
        !item.parent &&
        item.confidence !== "low" &&
        item.sources?.length &&
        item.trigger.osm?.length &&
        poiMatchesTrigger(p, item.trigger.osm),
    );
    if (!story && !isStoryKind(p)) return false;
    // Roughly between origin and destination, not behind either.
    return haversineM(from, p) + haversineM(p, to) <= Math.max(direct * 2, direct + 400);
  });
  if (cands.length < 2) return null;
  const CELL = 0.0015;
  const cells = new Map<string, Poi[]>();
  for (const p of cands) {
    const key = `${Math.floor(p.lat / CELL)}:${Math.floor(p.lon / CELL)}`;
    const list = cells.get(key);
    if (list) list.push(p);
    else cells.set(key, [p]);
  }
  let best: Poi[] | null = null;
  for (const list of cells.values()) {
    if (list.length < 2) continue;
    if (!best || list.length > best.length) best = list;
  }
  if (!best) return null;
  const centroid = {
    lat: best.reduce((s, p) => s + p.lat, 0) / best.length,
    lon: best.reduce((s, p) => s + p.lon, 0) / best.length,
  };
  let waypoint = best[0];
  let waypointD = haversineM(centroid, waypoint);
  for (const p of best) {
    const d = haversineM(centroid, p);
    if (d < waypointD) {
      waypoint = p;
      waypointD = d;
    }
  }
  return { lat: waypoint.lat, lon: waypoint.lon };
}

export interface RouteOptionsResult {
  fastest: WalkRoute;
  hearMore: WalkRoute | null;
  stories: number[]; // story counts for [fastest, hearMore?], same order
  fallback: boolean;
}

// Fastest route plus, when one qualifies, a "hear more" route. Never throws
// for a lack of alternatives: worst case the fastest route walks alone
// (router down, single path, or no livelier detour). RouteTooLongError from
// getRoute still propagates so the API can answer 400.
export async function getRouteOptions(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  hometown?: string,
): Promise<RouteOptionsResult> {
  const { route: fastest, fallback } = await getRoute(from, to);
  const items = getKnowledgeItems();
  const candidates: WalkRoute[] = [];
  try {
    for (const r of await fetchOsrmRoutes([from, to], true)) {
      if (!sameRoute(r, fastest) && candidates.every((c) => !sameRoute(c, r))) candidates.push(r);
    }
  } catch {
    // Alternatives are best-effort; the fastest route still stands.
  }
  let pois: Poi[] = [];
  try {
    pois = await collectPois(from, to);
  } catch {
    pois = [];
  }
  const waypoint = findStoryWaypoint(pois, items, fastest, from, to);
  if (waypoint) {
    try {
      const via = await fetchOsrmRoutes([from, waypoint, to]);
      if (via[0] && !sameRoute(via[0], fastest) && candidates.every((c) => !sameRoute(c, via[0]))) {
        candidates.push(via[0]);
      }
    } catch {
      // A waypoint the router cannot reach is simply skipped.
    }
  }
  const scoredFastest: ScoredRoute = {
    route: fastest,
    ...scoreRouteStories(fastest, pois, items, hometown),
  };
  const scored = candidates.map((route) => ({ route, ...scoreRouteStories(route, pois, items, hometown) }));
  const hearMore = selectHearMore(scoredFastest, scored);
  return {
    fastest,
    hearMore: hearMore?.route ?? null,
    stories: hearMore ? [scoredFastest.stories, hearMore.stories] : [scoredFastest.stories],
    fallback,
  };
}
