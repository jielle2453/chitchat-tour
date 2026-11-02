"use client";
// Live discovery prefetch: while walking, research interesting places ahead of
// the walker so a sourced narration is already cached when they arrive.
// KB point matches always win: KB-covered POIs are never researched, and a
// cached live narration is only delivered when no KB pin is waiting nearby.
import { useEffect, useRef, useState } from "react";
import { distanceM } from "@/lib/geo";
import { getKnowledgeItems } from "@/lib/kb";
import type { GeoFix, KnowledgeItem, Narration, NearbyPoi, Poi, TraceStep, UserProfile, WalkRoute } from "@/lib/types";
import { postJson } from "./api";
import { poisAlongRoute, progressOnRoute, ROUTE_CORRIDOR_M } from "./navEngine";

export const PREFETCH_EVERY_M = 50;
export const RESEARCH_MIN_M = 60;
export const RESEARCH_MAX_M = 250;
export const AHEAD_DEG = 60;
export const DELIVER_WITHIN_M = 40;
export const MAX_IN_FLIGHT = 2;
export const MAX_LIVE_PER_WALK = 12;
export const LIVE_GAP_MS = 90_000;
const KB_PIN_BLOCK_M = 80;
const MAX_TRACE = 100;

function now(): number {
  return Date.now();
}

function angleDiff(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

// Same matching semantics as the trigger engine (kept local; pure for tests).
function poiMatches(poi: Poi, patterns: string[]): boolean {
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

export function poiCoveredByKb(poi: Poi, items: KnowledgeItem[]): KnowledgeItem | null {
  for (const item of items) {
    if (item.layer !== "point" || item.trigger.osm.length === 0) continue;
    if (poiMatches(poi, item.trigger.osm)) return item;
  }
  return null;
}

const KIND_PREF: Record<Poi["kind"], number> = {
  place_of_worship: 5,
  marketplace: 5,
  other: 3,
  convenience: 1,
  bicycle_rental: 1,
  subway_entrance: 1,
  bus_stop: 0,
  traffic_signals: 0,
};

// Transit infrastructure is dull research material and wastes web searches.
function hasTransitTags(poi: Poi): boolean {
  const tags = poi.tags ?? {};
  const get = (k: string): string => String(tags[k] ?? "").toLowerCase();
  if (get("highway") === "bus_stop" || get("amenity") === "bus_station") return true;
  if (["platform", "stop_position", "station", "stop_area"].includes(get("public_transport"))) return true;
  if (["platform", "stop", "halt"].includes(get("railway"))) return true;
  return false;
}

// Generic or route-number names ("Jinhua Building (bus_stop)", "12", "MRT Exit 3").
function isGenericName(name: string): boolean {
  const s = name.trim();
  if (/\(\s*(bus_stop|bus_station|platform|subway_entrance)\s*\)/i.test(s)) return true;
  if (/^(bus\s*stop|公車站|巴士站|站牌|バス停|버스정류장)/i.test(s)) return true;
  if (/^[\d\s\-–—#路号號線号線番線]+$/.test(s)) return true;
  return false;
}

// Worth spending a web search on: named, non-transit places. Prefer markets,
// temples, parks, historic sites, notable shops, schools, museums.
export function poiWorthResearching(poi: Poi): boolean {
  if (poi.kind === "bus_stop" || poi.kind === "traffic_signals") return false;
  if (hasTransitTags(poi)) return false;
  const name = poi.name ?? poi.brand;
  if (!name || isGenericName(name)) return false;
  return true;
}

// Interesting kinds first: worship/markets, then historic/museum/school/park,
// notable shops, then everything else researchers accept.
export function rankOfPoi(poi: Poi): number {
  let rank = KIND_PREF[poi.kind] ?? 1;
  const tags = poi.tags ?? {};
  const get = (k: string): string => String(tags[k] ?? "").toLowerCase();
  if (get("historic")) rank += 2;
  if (["museum", "gallery", "attraction", "artwork", "viewpoint"].includes(get("tourism"))) rank += 2;
  if (["school", "library", "theatre", "arts_centre"].includes(get("amenity"))) rank += 1;
  if (["park", "garden", "playground", "plaza"].includes(get("leisure"))) rank += 1;
  if (get("shop") && get("shop") !== "convenience") rank += 1;
  if (get("memorial")) rank += 1;
  return rank;
}

export const SAME_PLACE_M = 60;

// "Jinhua Building" vs "Jinhua Building (bus_stop)" a few metres apart.
export function normalizePoiName(name: string): string {
  return name.toLowerCase().replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

export function isSamePlace(a: Poi, b: Poi, maxM = SAME_PLACE_M): boolean {
  const na = a.name ?? a.brand;
  const nb = b.name ?? b.brand;
  if (!na || !nb) return false;
  if (normalizePoiName(na) !== normalizePoiName(nb)) return false;
  return distanceM(a, b) <= maxM;
}

export function selectAheadPois(opts: {
  pois: NearbyPoi[];
  fix: GeoFix;
  covered: (poi: NearbyPoi) => boolean;
  researchedIds: Set<string>;
  nearResearched?: Poi[];
  minM?: number;
  maxM?: number;
  aheadDeg?: number;
  limit?: number;
}): NearbyPoi[] {
  const { pois, fix, covered, researchedIds } = opts;
  const nearResearched = opts.nearResearched ?? [];
  const minM = opts.minM ?? RESEARCH_MIN_M;
  const maxM = opts.maxM ?? RESEARCH_MAX_M;
  const aheadDeg = opts.aheadDeg ?? AHEAD_DEG;
  const limit = opts.limit ?? MAX_IN_FLIGHT;
  return pois
    .filter((p) => {
      if (!poiWorthResearching(p)) return false;
      if (researchedIds.has(p.id) || covered(p)) return false;
      if (nearResearched.some((r) => r.id !== p.id && isSamePlace(p, r))) return false;
      const d = p.distanceM ?? distanceM(fix, p);
      if (d < minM || d > maxM) return false;
      if (fix.heading !== null && fix.heading !== undefined && angleDiff(p.bearingDeg, fix.heading) > aheadDeg) return false;
      return true;
    })
    .sort((a, b) => rankOfPoi(b) - rankOfPoi(a) || (a.distanceM ?? 0) - (b.distanceM ?? 0))
    .slice(0, limit);
}

// Destination mode: POIs inside the route corridor and ahead of the walker,
// ordered by distance along the route. The heading cone is ignored: the
// walker follows the line, not their nose.
export function selectRoutePois(opts: {
  pois: NearbyPoi[];
  fix: GeoFix;
  corridor: [number, number][];
  corridorM?: number;
  covered: (poi: NearbyPoi) => boolean;
  researchedIds: Set<string>;
  nearResearched?: Poi[];
  aheadM?: number;
  behindM?: number;
  limit?: number;
}): NearbyPoi[] {
  const { pois, fix, corridor, covered, researchedIds } = opts;
  const nearResearched = opts.nearResearched ?? [];
  const corridorM = opts.corridorM ?? ROUTE_CORRIDOR_M;
  const aheadM = opts.aheadM ?? RESEARCH_MAX_M;
  const behindM = opts.behindM ?? 20;
  const limit = opts.limit ?? MAX_IN_FLIGHT;
  const routeLike: WalkRoute = { coordinates: corridor, distanceM: 0, durationS: 0, steps: [] };
  const here = progressOnRoute(routeLike, fix).distanceAlongM;
  const byId = new Map(pois.map((p) => [p.id, p]));
  const out: NearbyPoi[] = [];
  for (const e of poisAlongRoute(routeLike, pois, corridorM)) {
    if (out.length >= limit) break;
    const p = byId.get(e.id);
    if (!p) continue;
    if (!poiWorthResearching(p)) continue;
    if (researchedIds.has(p.id) || covered(p)) continue;
    if (nearResearched.some((r) => r.id !== p.id && isSamePlace(p, r))) continue;
    const ahead = e.distanceAlongM - here;
    if (ahead < -behindM || ahead > aheadM) continue;
    out.push(p);
  }
  return out;
}

export interface DiscoverResult {
  narration: Narration | null;
  trace: TraceStep[];
}

export interface ResearchedEntry {
  poi: NearbyPoi;
  narration: Narration | null;
  at: number;
}

export interface UseDiscoverOptions {
  profile: UserProfile;
  fix: GeoFix | null;
  running: boolean; // a walk is active and locating
  canSpeak: boolean; // no narration playing, guide not busy (cooldown respected)
  kbPins: { lat: number; lon: number }[]; // KB point candidates: live yields to these
  onDeliver: (narration: Narration, poi: NearbyPoi) => void;
  routeCorridor?: [number, number][] | null; // [lon, lat]: research along the route instead of the heading cone
  corridorM?: number;
}

export function useDiscover(options: UseDiscoverOptions) {
  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  });

  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [researched, setResearched] = useState<Record<string, ResearchedEntry>>({});
  const researchedRef = useRef<Record<string, ResearchedEntry>>({});
  const deliveredRef = useRef<Set<string>>(new Set());
  const inFlightRef = useRef<Map<string, NearbyPoi>>(new Map());
  const lastCheckRef = useRef<{ lat: number; lon: number } | null>(null);
  const liveCountRef = useRef(0);
  const lastLiveAtRef = useRef(0);
  const capLoggedRef = useRef(false);
  const wasRunningRef = useRef(false);
  const lastAheadRef = useRef<{ at: number; key: string } | null>(null);

  const { fix, running } = options;

  useEffect(() => {
    // New walk: forget everything researched on the previous one.
    if (running && !wasRunningRef.current) {
      researchedRef.current = {};
      deliveredRef.current = new Set();
      inFlightRef.current = new Map();
      lastAheadRef.current = null;
      lastCheckRef.current = null;
      liveCountRef.current = 0;
      lastLiveAtRef.current = 0;
      capLoggedRef.current = false;
      setResearched({});
      setTrace([]);
    }
    wasRunningRef.current = running;
    if (!running || !fix) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    const pushSteps = (steps: TraceStep[]) => {
      if (!steps.length) return;
      setTrace((prev) => [...prev, ...steps].slice(-MAX_TRACE));
    };
    const say = (kind: TraceStep["kind"], message: string) => {
      pushSteps([{ kind, message, at: now() }]);
    };

    async function research(poi: NearbyPoi, profile: UserProfile, at: GeoFix): Promise<void> {
      if (inFlightRef.current.has(poi.id) || researchedRef.current[poi.id]) return;
      // Same place, slightly different coords (duplicate OSM elements): skip.
      const known = [...inFlightRef.current.values(), ...Object.values(researchedRef.current).map((e) => e.poi)];
      if (known.some((k) => isSamePlace(k, poi))) return;
      inFlightRef.current.set(poi.id, poi);
      liveCountRef.current += 1;
      const label = poi.name ?? poi.brand ?? poi.kind;
      say("decision", `Researching ${label}…`);
      try {
        const res = await postJson<DiscoverResult>("/api/discover", { profile, poi: stripPoi(poi), fix: at });
        const entry = { poi, narration: res.narration, at: now() };
        researchedRef.current[poi.id] = entry;
        setResearched((prev) => ({ ...prev, [poi.id]: entry }));
        pushSteps(res.trace);
        if (res.narration) say("decision", `Ready for when you get there: ${res.narration.title}.`);
      } catch (err) {
        say("error", `Research on ${label} failed (${err instanceof Error ? err.message : String(err)}).`);
      } finally {
        inFlightRef.current.delete(poi.id);
      }
    }

    function deliver(at: GeoFix): void {
      const o = optsRef.current;
      if (!o.canSpeak) return;
      if (now() - lastLiveAtRef.current < LIVE_GAP_MS) return;
      for (const entry of Object.values(researchedRef.current)) {
        if (!entry.narration || deliveredRef.current.has(entry.poi.id)) continue;
        if (distanceM(at, entry.poi) > DELIVER_WITHIN_M) continue;
        if (o.kbPins.some((pin) => distanceM(pin, entry.poi) < KB_PIN_BLOCK_M)) continue; // KB wins
        deliveredRef.current.add(entry.poi.id);
        lastLiveAtRef.current = now();
        say("decision", `Telling you about ${entry.narration.title} as you arrive.`);
        o.onDeliver(entry.narration, entry.poi);
        return;
      }
    }

    async function prefetch(at: GeoFix): Promise<void> {
      const o = optsRef.current;
      let pois: NearbyPoi[];
      try {
        const res = await fetch(`/api/nearby?lat=${at.lat}&lon=${at.lon}&radius=${RESEARCH_MAX_M}`);
        if (!res.ok) return;
        pois = ((await res.json()) as { pois: NearbyPoi[] }).pois ?? [];
      } catch {
        return;
      }
      const corridor = o.routeCorridor && o.routeCorridor.length > 1 ? o.routeCorridor : null;
      const ahead = corridor
        ? selectRoutePois({
            pois,
            fix: at,
            corridor,
            corridorM: o.corridorM ?? ROUTE_CORRIDOR_M,
            covered: (p) => poiCoveredByKb(p, getKnowledgeItems()) !== null,
            researchedIds: new Set([...Object.keys(researchedRef.current), ...inFlightRef.current.keys()]),
            nearResearched: [...Object.values(researchedRef.current).map((e) => e.poi), ...inFlightRef.current.values()],
          })
        : selectAheadPois({
            pois,
            fix: at,
            covered: (p) => poiCoveredByKb(p, getKnowledgeItems()) !== null,
            researchedIds: new Set([...Object.keys(researchedRef.current), ...inFlightRef.current.keys()]),
            nearResearched: [...Object.values(researchedRef.current).map((e) => e.poi), ...inFlightRef.current.values()],
          });
      if (ahead.length > 0) {
        const key = ahead.map((p) => p.id).join("|");
        const prev = lastAheadRef.current;
        if (!prev || prev.key !== key || now() - prev.at >= 60_000) {
          lastAheadRef.current = { at: now(), key };
          say("position", `Looking ahead: ${ahead.length} place${ahead.length > 1 ? "s" : ""} within ${RESEARCH_MAX_M} m to research.`);
        }
      }
      for (const poi of ahead) {
        if (inFlightRef.current.size >= MAX_IN_FLIGHT) return;
        if (liveCountRef.current >= MAX_LIVE_PER_WALK) {
          if (!capLoggedRef.current) {
            capLoggedRef.current = true;
            say("skip", `Live research budget used up for this walk (${MAX_LIVE_PER_WALK}); the knowledge base carries on.`);
          }
          return;
        }
        void research(poi, o.profile, at);
      }
    }

    const last = lastCheckRef.current;
    if (!last || distanceM(last, fix) >= PREFETCH_EVERY_M) {
      lastCheckRef.current = { lat: fix.lat, lon: fix.lon };
      void prefetch(fix);
    }
    deliver(fix);
  }, [fix, running]);

  return { trace, researched };
}

function stripPoi(poi: NearbyPoi): Poi {
  return { id: poi.id, kind: poi.kind, name: poi.name, brand: poi.brand, lat: poi.lat, lon: poi.lon, tags: poi.tags };
}
