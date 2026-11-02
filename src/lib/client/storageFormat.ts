// Pure parts of the storage layer: versioned envelopes and migrations/sanitising. No browser APIs here.
import type { Discovery, Lang, UserProfile, WalkRecord } from "@/lib/types";

export interface Envelope<T> {
  v: number;
  data: T;
}

export const KEYS = {
  profile: "rg.profile.v1",
  settings: "rg.settings.v1",
  discoveries: "rg.discoveries.v1",
  walks: "rg.walks.v1",
  heard: "rg.heard.v1",
  walkState: "rg.walkState.v1",
} as const;

export const LEGACY_KEYS = ["rg.profile", "rg.narrations", "rg.cards", "rg.walkState.walk", "rg.walkState.sim-a", "rg.walkState.sim-b"];

export function serialize<T>(version: number, data: T): string {
  return JSON.stringify({ v: version, data } satisfies Envelope<T>);
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

// Read a stored string. Envelope with the current version -> data. Older envelope or bare legacy JSON ->
// `migrate(data, fromVersion)`. Newer version, garbage, or a failed migration -> fallback.
export function parseVersioned<T>(
  raw: string | null,
  version: number,
  fallback: T,
  migrate?: (data: unknown, from: number) => T | null,
): T {
  if (!raw) return fallback;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (isObj(parsed) && typeof parsed.v === "number" && "data" in parsed) {
    if (parsed.v === version) return parsed.data as T;
    if (parsed.v < version && migrate) return migrate(parsed.data, parsed.v) ?? fallback;
    return fallback;
  }
  return migrate ? (migrate(parsed, 0) ?? fallback) : fallback;
}

const LANGS: Lang[] = ["en", "ja", "zh-TW", "ko"];

export function sanitizeProfile(x: unknown): UserProfile | null {
  if (!isObj(x)) return null;
  const lang = LANGS.includes(x.lang as Lang) ? (x.lang as Lang) : null;
  if (!lang) return null;
  const hometown = typeof x.hometown === "string" ? x.hometown.slice(0, 2).toUpperCase() : "";
  return { lang, hometown };
}

export type Frequency = "often" | "normal" | "rarely";
export interface Settings {
  frequency: Frequency;
  voiceRate: number;
  demo: boolean;
  routeId: string | null;
}
export const DEFAULT_SETTINGS: Settings = { frequency: "normal", voiceRate: 1, demo: false, routeId: null };

export function sanitizeSettings(x: unknown): Settings | null {
  if (!isObj(x)) return null;
  const frequency: Frequency = x.frequency === "often" || x.frequency === "rarely" ? x.frequency : "normal";
  const rate = typeof x.voiceRate === "number" && x.voiceRate >= 0.5 && x.voiceRate <= 2 ? x.voiceRate : 1;
  return { frequency, voiceRate: rate, demo: x.demo === true, routeId: typeof x.routeId === "string" ? x.routeId : null };
}

function validDiscovery(d: unknown): d is Discovery {
  if (!isObj(d) || typeof d.id !== "string" || typeof d.at !== "number") return false;
  const n = d.narration;
  return isObj(n) && typeof n.text === "string" && typeof n.title === "string" && typeof n.id === "string";
}

export function sanitizeDiscoveries(x: unknown): Discovery[] | null {
  if (!Array.isArray(x)) return null;
  return x.filter(validDiscovery).map((d) => ({
    ...d,
    lat: typeof d.lat === "number" ? d.lat : null,
    lon: typeof d.lon === "number" ? d.lon : null,
    walkId: typeof d.walkId === "string" ? d.walkId : null,
  }));
}

function validWalk(w: unknown): w is WalkRecord {
  return isObj(w) && typeof w.id === "string" && typeof w.startedAt === "number" && Array.isArray(w.path);
}

export function sanitizeWalks(x: unknown): WalkRecord[] | null {
  if (!Array.isArray(x)) return null;
  return x.filter(validWalk).map((w) => ({
    ...w,
    endedAt: typeof w.endedAt === "number" ? w.endedAt : null,
    areaName: typeof w.areaName === "string" ? w.areaName : null,
    distanceM: typeof w.distanceM === "number" ? w.distanceM : 0,
    discoveryIds: Array.isArray(w.discoveryIds) ? w.discoveryIds.filter((i): i is string => typeof i === "string") : [],
    simulated: w.simulated === true,
  }));
}

// v0 (bare, pre-envelope) and v1 data go through the same sanitisers.
export const migrateProfile = (data: unknown) => sanitizeProfile(data);
export const migrateSettings = (data: unknown) => sanitizeSettings(data);
export const migrateDiscoveries = (data: unknown) => sanitizeDiscoveries(data);
export const migrateWalks = (data: unknown) => sanitizeWalks(data);
