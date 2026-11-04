"use client";
// localStorage helpers. Everything is wrapped in try/catch: storage can be blocked or full.
// Keys are versioned envelopes ({v, data}); see storageFormat.ts for the pure parts.
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Discovery, UserProfile, WalkRecord } from "@/lib/types";
import {
  DEFAULT_SETTINGS,
  KEYS,
  LEGACY_KEYS,
  migrateDiscoveries,
  migrateProfile,
  migrateSettings,
  migrateWalks,
  parseVersioned,
  serialize,
  type Settings,
} from "./storageFormat";
import { dayKey } from "./walkPath";

const EVENT = "rg-storage";
const VERSION = 1;

function getRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function readStored<T>(key: string, fallback: T, migrate?: (d: unknown, from: number) => T | null): T {
  return parseVersioned(getRaw(key), VERSION, fallback, migrate);
}

// Returns false when the write failed (quota, blocked storage).
export function writeStored(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, serialize(VERSION, value));
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    return false;
  }
}

function removeStored(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function useStored<T>(key: string, fallback: T, migrate?: (d: unknown, from: number) => T | null) {
  const raw = useSyncExternalStore(subscribe, () => getRaw(key), () => null);
  return useMemo<T>(() => parseVersioned(raw, VERSION, fallback, migrate), [raw, fallback, migrate]);
}

// true after hydration; false during SSR and the hydration render.
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}

// Local calendar day; empty string on the server. Re-checked when the tab regains focus.
export function useToday(): string {
  return useSyncExternalStore(
    (cb) => {
      document.addEventListener("visibilitychange", cb);
      return () => document.removeEventListener("visibilitychange", cb);
    },
    () => dayKey(Date.now()),
    () => "",
  );
}

// ---------- profile ----------

export const DEFAULT_PROFILE: UserProfile = { hometown: "", lang: "en" };
const NO_PROFILE = null as UserProfile | null;

export function useProfile() {
  const stored = useStored<UserProfile | null>(KEYS.profile, NO_PROFILE, migrateProfile);
  const setProfile = useCallback((p: UserProfile) => {
    writeStored(KEYS.profile, p);
  }, []);
  return { profile: stored ?? DEFAULT_PROFILE, hasProfile: stored !== null, setProfile };
}

// ---------- settings ----------

export function useSettings() {
  const stored = useStored<Settings>(KEYS.settings, DEFAULT_SETTINGS, migrateSettings);
  // fields added later (e.g. `sound`) take their default in older saved settings
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...stored }), [stored]);
  const update = useCallback((patch: Partial<Settings>) => {
    writeStored(KEYS.settings, { ...readStored<Settings>(KEYS.settings, DEFAULT_SETTINGS, migrateSettings), ...patch });
  }, []);
  return [settings, update] as const;
}

// ---------- notebook ----------

const EMPTY_DISCOVERIES: Discovery[] = [];
const EMPTY_WALKS: WalkRecord[] = [];

export const readDiscoveries = () => readStored<Discovery[]>(KEYS.discoveries, EMPTY_DISCOVERIES, migrateDiscoveries);
export const readWalks = () => readStored<WalkRecord[]>(KEYS.walks, EMPTY_WALKS, migrateWalks);

export function useDiscoveries(): Discovery[] {
  return useStored<Discovery[]>(KEYS.discoveries, EMPTY_DISCOVERIES, migrateDiscoveries);
}
export function useWalks(): WalkRecord[] {
  return useStored<WalkRecord[]>(KEYS.walks, EMPTY_WALKS, migrateWalks);
}

// Saves a discovery to the notebook; returns false if storage refused it.
// A story already in the notebook (same knowledge item, or same title for
// live/web stories) never becomes a second sticker.
export function sameStory(a: Discovery, b: Discovery): boolean {
  if (a.narration.itemId || b.narration.itemId) return a.narration.itemId === b.narration.itemId;
  return a.narration.title.trim() === b.narration.title.trim();
}

// Sample walks (ids "demo-…") are examples, not things this visitor heard.
export function notebookItemIds(): string[] {
  return readDiscoveries().flatMap((d) => (d.narration.itemId && !d.id.startsWith("demo-") ? [d.narration.itemId] : []));
}

export function saveDiscovery(d: Discovery): boolean {
  const existing = readDiscoveries();
  // a story already in the notebook keeps its one sticker; this walk's page just points at it
  const dup = existing.find((x) => x.id !== d.id && !x.id.startsWith("demo-") && sameStory(x, d));
  if (!dup) {
    const list = existing.filter((x) => x.id !== d.id);
    if (!writeStored(KEYS.discoveries, [d, ...list])) return false;
  }
  const id = dup?.id ?? d.id;
  if (d.walkId) {
    const walks = readWalks();
    const w = walks.find((x) => x.id === d.walkId);
    if (w && !w.discoveryIds.includes(id)) {
      writeStored(KEYS.walks, walks.map((x) => (x.id === w.id ? { ...x, discoveryIds: [...x.discoveryIds, id] } : x)));
    }
  }
  return true;
}

export function removeWalk(id: string) {
  writeStored(KEYS.walks, readWalks().filter((w) => w.id !== id));
}

export function upsertWalk(record: WalkRecord) {
  const walks = readWalks();
  const i = walks.findIndex((w) => w.id === record.id);
  const next = i >= 0 ? walks.map((w, j) => (j === i ? record : w)) : [record, ...walks];
  writeStored(KEYS.walks, next.slice(0, 200));
}

// ---------- "heard today": everything the guide said, kept even when not stuck in the notebook ----------

const EMPTY_HEARD: Discovery[] = [];
const MAX_HEARD = 40;

export function useHeard(): Discovery[] {
  return useStored<Discovery[]>(KEYS.heard, EMPTY_HEARD, migrateDiscoveries);
}

export function addHeard(d: Discovery) {
  // stickers stay in memory only; the persisted list is text
  const slim: Discovery = { ...d, stickerDataUrl: undefined };
  const list = readStored<Discovery[]>(KEYS.heard, EMPTY_HEARD, migrateDiscoveries).filter((x) => x.id !== d.id);
  writeStored(KEYS.heard, [slim, ...list].slice(0, MAX_HEARD));
}

// ---------- housekeeping ----------

export function clearNotebook() {
  removeStored(KEYS.discoveries);
  removeStored(KEYS.walks);
  removeStored(KEYS.heard);
  window.dispatchEvent(new Event(EVENT));
}

// One-time move from the pre-notebook keys.
export function migrateLegacyStorage() {
  const legacy = getRaw("rg.profile");
  if (legacy && !getRaw(KEYS.profile)) {
    try {
      const p = migrateProfile(JSON.parse(legacy));
      if (p) writeStored(KEYS.profile, p);
    } catch {
      // ignore
    }
  }
  for (const k of LEGACY_KEYS) removeStored(k);
}
