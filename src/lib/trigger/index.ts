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
}

export const DEFAULT_TRIGGER_CONFIG: TriggerConfig = {
  cooldownMs: 150_000,
  maxCandidates: 5,
  nationalItemIdleMs: 240_000,
};

// ---------------------------------------------------------------------------
// Scoring (all weights live here; the final score is clamped to 0..1)
//
//   score = layer base + hometown relativity + confidence
//           + proximity + ahead bonus (point layer only)
//           - disputed - variety - time-of-day mismatch
//
// Hometown relativity is the core signal: "absent at home" beats "different",
// which beats "unknown"; "same" is kept only as a low-weight resonance item.
// Point items get a high base so a good nearby match outranks area facts.
// National items need no place, so they get no base and are only eligible
// when no point item is convincing or the walker has been quiet for a while.
// ---------------------------------------------------------------------------
export const WEIGHTS = {
  layerBase: { point: 0.25, area: 0.05, national: 0 },
  hometown: { absent: 0.4, different: 0.32, unknown: 0.12, same: 0.04 } as Record<HometownStatus, number>,
  confidence: { high: 0.1, medium: 0.04, low: 0 },
  proximityMax: 0.15, // scaled by 1 - distance/radius
  aheadBonus: 0.05,
  aheadAngleDeg: 60,
  disputedPenalty: 0.15,
  varietyLastPenalty: 0.15, // same category as the last told item
  varietyRecentPenalty: 0.07, // same category within the last 3 told items
  timeMismatchPenalty: 0.2,
  nationalPointThreshold: 0.5, // national items wait while a point item scores above this
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

  const scored: Candidate[] = [];

  for (const item of items) {
    if (told.has(item.id)) continue;
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

    scored.push({
      itemId: item.id,
      ...(poiId !== undefined && { poiId, distanceM, bearingDeg }),
      score: Math.min(1, Math.max(0, score)),
      reasons,
    });
  }

  const layerOf = new Map(items.map((i) => [i.id, i.layer]));
  const bestPoint = Math.max(0, ...scored.filter((c) => layerOf.get(c.itemId) === "point").map((c) => c.score));
  const idle = state.lastSpokenAt !== null && now - state.lastSpokenAt >= cfg.nationalItemIdleMs;
  const nationalOk = bestPoint <= W.nationalPointThreshold || idle;

  return scored
    .filter((c) => {
      if (layerOf.get(c.itemId) !== "national") return true;
      if (!nationalOk) return false;
      c.reasons.unshift(idle ? "quiet for a while, national fact" : "nothing strong nearby, national fact");
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, cfg.maxCandidates);
}

export function emptyWalkState(): WalkState {
  return { toldItemIds: [], lastSpokenAt: null, history: [] };
}
