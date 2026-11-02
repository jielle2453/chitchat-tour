// Trigger engine: decides when the guide may speak and which knowledge items
// are worth telling this user, before anything is sent to the model.
// Pure functions, runs in the browser. Implementation: trigger module owner.
import type {
  Candidate,
  GeoFix,
  HometownStatus,
  KnowledgeItem,
  NearbyPoi,
  UserProfile,
  WalkState,
} from "@/lib/types";

export interface TriggerConfig {
  cooldownMs: number; // minimum gap between two narrations
  maxCandidates: number; // how many to send to the agent
  nationalItemIdleMs: number; // speak a national-layer item after this long with nothing nearby
  areaItemIdleMs?: number; // speak an area-layer item after this long with nothing nearby
  sightingWindowMs?: number; // a sighting unlocks sighting-layer items for this long
}

export const DEFAULT_TRIGGER_CONFIG: TriggerConfig = {
  cooldownMs: 150_000,
  maxCandidates: 5,
  nationalItemIdleMs: 480_000,
};

export const AREA_ITEM_IDLE_MS = 300_000;
export const SIGHTING_WINDOW_MS = 600_000; // ~10 minutes
export const MAX_SIGHTINGS = 20;

// ---------------------------------------------------------------------------
// Scoring (all weights live here; the final score is clamped to 0..1)
//
//   score = layer base + hometown relativity + confidence
//           + proximity + ahead bonus (point layer only)
//           + recency (sighting layer only)
//           - disputed - variety - time-of-day mismatch
//
// Hometown relativity is the core signal: "absent at home" beats "different",
// which beats "unknown"; "same" is kept only as a low-weight resonance item.
// A sighting-layer item gets the highest base: the thing is literally in
// front of the walker (they just photographed or asked about it).
// Point items get a high base so a good nearby match outranks filler facts.
// Area/national items get a low base and are only eligible on quiet stretches
// (no point/sighting candidate plus a long idle gap), so they can never
// outrank something the walker actually encounters.
// ---------------------------------------------------------------------------
export const WEIGHTS = {
  layerBase: { point: 0.25, area: 0.05, national: 0, sighting: 0.45 } as Record<KnowledgeItem["layer"], number>,
  hometown: { absent: 0.4, different: 0.32, unknown: 0.12, same: 0.04 } as Record<HometownStatus, number>,
  confidence: { high: 0.1, medium: 0.04, low: 0 },
  proximityMax: 0.15, // scaled by 1 - distance/radius
  aheadBonus: 0.05,
  aheadAngleDeg: 60,
  sightingRecencyMax: 0.05, // fresher sightings score a little higher
  disputedPenalty: 0.15,
  varietyLastPenalty: 0.15, // same category as the last told item
  varietyRecentPenalty: 0.07, // same category within the last 3 told items
  timeMismatchPenalty: 0.2,
  radiusBaseM: 40,
  radiusMinM: 40,
  radiusMaxM: 150,
  recentWindow: 3,
};

const TAIPEI_OFFSET_MS = 8 * 3600_000;

export function shouldSpeak(state: WalkState, now: number, cfg: TriggerConfig = DEFAULT_TRIGGER_CONFIG): boolean {
  return state.lastSpokenAt === null || now - state.lastSpokenAt >= cfg.cooldownMs;
}

function triggerRadius(accuracy: number): number {
  const r = WEIGHTS.radiusBaseM + (Number.isFinite(accuracy) ? accuracy : 0);
  return Math.min(WEIGHTS.radiusMaxM, Math.max(WEIGHTS.radiusMinM, r));
}

function angleDiff(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

function poiMatches(poi: NearbyPoi, patterns: string[]): boolean {
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

function periodsFit(context: string | undefined, hour: number): boolean {
  if (!context) return true;
  const c = context.toLowerCase();
  const fits: boolean[] = [];
  if (/morning/.test(c)) fits.push(hour >= 5 && hour < 11);
  if (/evening/.test(c)) fits.push(hour >= 16 && hour < 21);
  if (/night/.test(c)) fits.push(hour >= 19 || hour < 5);
  return fits.length === 0 || fits.some(Boolean);
}

function poiLabel(poi: NearbyPoi): string {
  return poi.name || poi.brand || poi.kind.replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Sighting concepts: matched against KnowledgeItem.trigger.photo_concepts.
// Matching is case-insensitive and forgives simple plurals ("trucks" matches
// "truck") plus a small synonym map ("trash truck" matches "garbage truck").
// ---------------------------------------------------------------------------

function singularize(word: string): string {
  if (/ies$/.test(word)) return word.slice(0, -3) + "y";
  if (/(ses|xes|zes|ches|shes)$/.test(word)) return word.slice(0, -2);
  if (/s$/.test(word) && !/ss$/.test(word)) return word.slice(0, -1);
  return word;
}

export function normConcept(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ").split(" ").map(singularize).join(" ");
}

// Each group lists spellings that mean the same encountered thing.
const CONCEPT_SYNONYM_GROUPS: string[][] = [
  ["garbage truck", "trash truck", "refuse truck", "garbage lorry"],
  ["trash can", "garbage can", "litter bin", "rubbish bin", "street trash can", "trash bin", "public bin", "street bin"],
  ["official trash bag", "garbage bag", "trash bag", "designated trash bag"],
  ["manhole cover", "manhole", "decorated manhole cover"],
  ["utility pole", "power pole", "telephone pole", "telegraph pole"],
  ["overhead wires", "power lines", "overhead power lines"],
  ["rooftop water tank", "water tank", "water tower", "rooftop tank"],
  ["iron window grille", "iron window bars", "window bars", "window grille"],
  ["arcade", "qilou", "covered sidewalk", "arcade walkway", "covered walkway"],
  ["convenience store", "corner store", "konbini"],
  ["offering table", "ghost month offerings", "offerings", "pudu table"],
  ["breakfast shop", "breakfast store", "soy milk shop"],
  ["youbike station", "bike share station", "bicycle rental station"],
  ["fare gate", "ticket gate"],
];

const CONCEPT_CANONICAL = new Map<string, number>();
for (let i = 0; i < CONCEPT_SYNONYM_GROUPS.length; i++) {
  for (const variant of CONCEPT_SYNONYM_GROUPS[i]) CONCEPT_CANONICAL.set(normConcept(variant), i);
}

export function conceptsMatch(a: string, b: string): boolean {
  const na = normConcept(a);
  const nb = normConcept(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ga = CONCEPT_CANONICAL.get(na);
  return ga !== undefined && ga === CONCEPT_CANONICAL.get(nb);
}

function matchingSighting(concepts: string[] | undefined, sightings: { concept: string; at: number; source: "photo" | "ask" }[], now: number, windowMs: number) {
  let best: { concept: string; at: number; source: "photo" | "ask" } | null = null;
  for (const s of sightings) {
    if (now - s.at > windowMs || now - s.at < 0) continue;
    if (!concepts?.some((c) => conceptsMatch(c, s.concept))) continue;
    if (!best || s.at > best.at) best = s;
  }
  return best;
}

export function agePhrase(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  return m <= 1 ? "1 min ago" : `${m} min ago`;
}

// ---------------------------------------------------------------------------
// Topic groups for de-duplication: items about the same encountered thing
// (all `garbage-truck-*`, all `manhole-*`, ...) must not be told back to
// back. At most one item per group is told per walk, unless the walker asks
// about it (an ask-source sighting lifts the block for the matching items).
// Groups are an explicit map so odd ids (`manhole-covers-art` vs
// `manhole-anti-slip`) still land together; unknown ids fall back to their
// first two hyphen segments.
// ---------------------------------------------------------------------------

const TOPIC_GROUPS: Record<string, string> = {
  // Facet entries (ids with `parent` set in the KB) stay grouped with their
  // topic for history de-dup, even though facets are never ranked.
  "garbage-truck-why-music": "garbage-truck",
  "garbage-truck-japan-origin": "garbage-truck",
  "garbage-truck-maidens-prayer": "garbage-truck",
  "garbage-truck-1984-tune-swap": "garbage-truck",
  "garbage-truck-local-tunes": "garbage-truck",
  "taipei-pay-as-you-throw": "trash-policy",
  "few-public-trash-cans": "trash-policy",
  "household-trash-in-public-bins-fine": "trash-policy",
  "convenience-store-density": "convenience-store",
  "convenience-store-area-density": "convenience-store",
  "convenience-store-bill-payment": "convenience-store",
  "convenience-store-tax-payment": "convenience-store",
  "mrt-no-eating": "mrt",
  "mrt-fare-gate-yellow-line": "mrt",
  "mrt-station-codes": "mrt",
  "priority-seats-renamed-2025": "mrt",
  "escalator-stand-both-sides": "mrt",
  "pedestrian-flashing-green-rule": "pedestrian-signal",
  "pedestrian-green-man-run-animation": "pedestrian-signal",
  "intersection-no-right-on-red": "intersection",
  "two-stage-left-turn-origin": "two-stage-left-turn",
  "two-stage-left-turn-tainan": "two-stage-left-turn",
  "scooter-helmet-law-1997": "scooter-helmet",
  "motorcycles-out-of-arcades": "arcade",
  "youbike-origin": "youbike",
  "youbike-free-30-min": "youbike",
  "bus-tap-on-off": "bus",
  "easycard-2002": "easycard",
  "manhole-covers-art": "manhole",
  "manhole-anti-slip": "manhole",
  "overhead-power-lines": "power-lines",
  "arcade-qilou-origin": "arcade",
  "arcade-is-road": "arcade",
  "taipei-grand-mosque": "mosque",
  "dongmen-market-1928": "market",
  "dintaifeng-oil-shop-1972": "dintaifeng",
  "rongjin-prison-dorms": "rongjin",
  "daan-park-no7": "daan-park",
  "red-green-postboxes": "postbox",
  "receipt-lottery-1951": "receipt-lottery",
  "plastic-bag-fee-2002": "plastic-bag",
  "typhoon-day-off": "typhoon",
  "claw-machine-shops": "claw-machine",
  "food-delivery-riders": "food-delivery",
  "outdoor-banquet-banzhuo": "banquet",
  "temple-procession-bajiajiang": "procession",
};

export function topicGroup(itemId: string): string {
  const g = TOPIC_GROUPS[itemId];
  if (g) return g;
  const parts = itemId.split("-");
  return parts.length >= 2 ? parts.slice(0, 2).join("-") : itemId;
}

// ---------------------------------------------------------------------------
// Walk-state sighting helpers (pure; the phone persists the returned state).
// ---------------------------------------------------------------------------

export function addSighting(state: WalkState, concept: string, source: "photo" | "ask", at: number): WalkState {
  const trimmed = concept.trim();
  if (!trimmed) return state;
  const key = normConcept(trimmed);
  const sightings = (state.sightings ?? []).filter((s) => normConcept(s.concept) !== key);
  sightings.push({ concept: trimmed, at, source });
  return { ...state, sightings: sightings.slice(-MAX_SIGHTINGS) };
}

// Known photo concepts mentioned verbatim in free text (longest first; a
// concept already covered by a longer match, e.g. "truck" in "garbage
// truck", is not reported twice).
export function findConceptsInText(text: string, knownConcepts: string[]): string[] {
  const q = text.toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of [...knownConcepts].sort((a, b) => b.length - a.length)) {
    const t = c.trim().toLowerCase();
    if (!t || seen.has(normConcept(t))) continue;
    if (!q.includes(t)) continue;
    if (out.some((m) => m.toLowerCase().includes(t))) continue;
    seen.add(normConcept(t));
    out.push(c.trim());
  }
  return out;
}

export function rankCandidates(input: {
  fix: GeoFix;
  profile: UserProfile;
  pois: NearbyPoi[];
  items: KnowledgeItem[];
  state: WalkState;
  now: number;
  cfg?: TriggerConfig;
}): Candidate[] {
  const { fix, profile, pois, items, state, now } = input;
  const cfg = input.cfg ?? DEFAULT_TRIGGER_CONFIG;
  const W = WEIGHTS;
  const told = new Set(state.toldItemIds);
  const toldGroups = new Set(state.history.map((h) => topicGroup(h.itemId)));
  const sightings = state.sightings ?? [];
  const windowMs = cfg.sightingWindowMs ?? SIGHTING_WINDOW_MS;
  const radius = triggerRadius(fix.accuracy);
  const hour = new Date(now + TAIPEI_OFFSET_MS).getUTCHours();
  const lastItemId = state.history.length ? state.history[state.history.length - 1].itemId : null;
  const byId = new Map(items.map((i) => [i.id, i]));
  const lastCategory = lastItemId ? byId.get(lastItemId)?.category : undefined;
  const recentCategories = new Set(
    state.history
      .slice(-W.recentWindow)
      .map((h) => byId.get(h.itemId)?.category)
      .filter(Boolean),
  );

  const scored: (Candidate & { layer: KnowledgeItem["layer"]; group: string })[] = [];

  for (const item of items) {
    if (told.has(item.id)) continue;
    // Facets (parent set) are never candidates on their own; they stay in
    // the KB so "tell me more" and questions can use them.
    if (item.parent) continue;
    if (item.confidence === "low") continue;
    if (!item.sources || item.sources.length === 0) continue;

    const reasons: string[] = [];
    let score = W.layerBase[item.layer];
    let poiId: string | undefined;
    let distanceM: number | undefined;
    let bearingDeg: number | undefined;

    if (item.layer === "point") {
      let best: { poi: NearbyPoi; value: number; ahead: boolean } | null = null;
      for (const poi of pois) {
        if (poi.distanceM > radius || !poiMatches(poi, item.trigger.osm)) continue;
        const ahead = fix.heading !== null && angleDiff(poi.bearingDeg, fix.heading) < W.aheadAngleDeg;
        const value = W.proximityMax * (1 - poi.distanceM / radius) + (ahead ? W.aheadBonus : 0);
        if (!best || value > best.value) best = { poi, value, ahead };
      }
      if (!best) continue;
      score += best.value;
      poiId = best.poi.id;
      distanceM = best.poi.distanceM;
      bearingDeg = best.poi.bearingDeg;
      reasons.push(`${poiLabel(best.poi)} ${Math.round(best.poi.distanceM)} m ${best.ahead ? "ahead" : "nearby"}`);
    } else if (item.layer === "sighting") {
      // Only after the walker photographed or asked about the thing.
      const hit = matchingSighting(item.trigger.photo_concepts, sightings, now, windowMs);
      if (!hit) continue;
      score += W.sightingRecencyMax * (1 - (now - hit.at) / windowMs);
      const verb = hit.source === "photo" ? "photographed" : "asked about";
      reasons.push(`you ${verb} ${hit.concept} ${agePhrase(hit.at, now)}`);
    } else if (item.layer === "area") {
      reasons.push("area-level fact, no specific spot needed");
    }

    const home = profile.hometown;
    const status: HometownStatus = item.hometown?.[home]?.status ?? "unknown";
    score += W.hometown[status];
    if (status === "absent") reasons.push(`absent in ${home}`);
    else if (status === "different") reasons.push(`different from ${home}`);
    else if (status === "same") reasons.push(`same as in ${home} (resonance)`);
    else reasons.push(`no ${home} comparison yet`);

    score += W.confidence[item.confidence];
    reasons.push(`${item.confidence} confidence`);

    if (item.disputed) {
      score -= W.disputedPenalty;
      reasons.push("disputed, hedge it");
    }

    if (lastCategory === item.category) {
      score -= W.varietyLastPenalty;
      reasons.push("same category as last story");
    } else if (recentCategories.has(item.category)) {
      score -= W.varietyRecentPenalty;
      reasons.push("category told recently");
    }

    if (!periodsFit(item.trigger.context, hour)) {
      score -= W.timeMismatchPenalty;
      reasons.push("wrong time of day");
    }

    // Topic de-dup: at most one item per group per walk. The walker asking
    // about the thing (an ask-source sighting matching this item) lifts the
    // block so follow-up questions can still be answered with its siblings.
    const group = topicGroup(item.id);
    if (toldGroups.has(group)) {
      const asked = sightings.some(
        (s) =>
          s.source === "ask" &&
          now - s.at <= windowMs &&
          now - s.at >= 0 &&
          item.trigger.photo_concepts?.some((c) => conceptsMatch(c, s.concept)),
      );
      if (!asked) continue;
      reasons.push("you asked about this again");
    }

    scored.push({
      itemId: item.id,
      ...(poiId !== undefined && { poiId, distanceM, bearingDeg }),
      score: Math.min(1, Math.max(0, score)),
      reasons,
      layer: item.layer,
      group,
    });
  }

  // Quiet-stretch fillers: area/national items are eligible only when nothing
  // the walker actually encounters (no point/sighting candidate) is available
  // and the walker has been quiet for a while, so they read as occasional
  // "by the way, in Taipei..." moments and can never outrank a real match.
  const areaIdleMs = cfg.areaItemIdleMs ?? AREA_ITEM_IDLE_MS;
  const idleFor = (ms: number) => state.lastSpokenAt === null || now - state.lastSpokenAt >= ms;
  const hasEncounter = scored.some((c) => c.layer === "point" || c.layer === "sighting");

  const eligible = scored.filter((c) => {
    if (c.layer === "area") {
      if (hasEncounter || !idleFor(areaIdleMs)) return false;
      c.reasons.unshift(
        state.lastSpokenAt === null ? "nothing nearby, area fact" : "quiet for a while, area fact",
      );
      return true;
    }
    if (c.layer === "national") {
      if (hasEncounter || !idleFor(cfg.nationalItemIdleMs)) return false;
      c.reasons.unshift(
        state.lastSpokenAt === null ? "nothing nearby, national fact" : "quiet for a while, national fact",
      );
      return true;
    }
    return true;
  });

  // One candidate per topic group: keep the best of each.
  const bestByGroup = new Map<string, (typeof eligible)[number]>();
  for (const c of eligible) {
    const prev = bestByGroup.get(c.group);
    if (!prev || c.score > prev.score) bestByGroup.set(c.group, c);
  }

  return [...bestByGroup.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, cfg.maxCandidates)
    .map((c): Candidate => {
      const out: Candidate = { itemId: c.itemId, score: c.score, reasons: c.reasons };
      if (c.poiId !== undefined) {
        out.poiId = c.poiId;
        out.distanceM = c.distanceM;
        out.bearingDeg = c.bearingDeg;
      }
      return out;
    });
}

export function emptyWalkState(): WalkState {
  return { toldItemIds: [], lastSpokenAt: null, history: [] };
}
