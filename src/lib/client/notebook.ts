// Pure grouping of notebook data into per-day pages.
import type { Discovery, WalkRecord } from "@/lib/types";
import { dayKey, type LatLon } from "./walkPath";

export interface DayEntry {
  date: string; // YYYY-MM-DD, local
  discoveries: Discovery[]; // oldest first, so a page reads in walking order
  walks: WalkRecord[];
  areaName: string | null;
  distanceM: number;
  paths: LatLon[][];
}

// One entry per local day that has at least one sticker, newest day first.
export function groupByDay(discoveries: Discovery[], walks: WalkRecord[]): DayEntry[] {
  const days = new Map<string, Discovery[]>();
  for (const d of discoveries) {
    const k = dayKey(d.at);
    days.set(k, [...(days.get(k) ?? []), d]);
  }
  const out: DayEntry[] = [];
  for (const [date, list] of days) {
    const sorted = [...list].sort((a, b) => a.at - b.at);
    const dayWalks = walks.filter((w) => dayKey(w.startedAt) === date).sort((a, b) => a.startedAt - b.startedAt);
    const area = dayWalks.find((w) => w.areaName)?.areaName ?? null;
    out.push({
      date,
      discoveries: sorted,
      walks: dayWalks,
      areaName: area,
      distanceM: dayWalks.reduce((s, w) => s + w.distanceM, 0),
      paths: dayWalks.map((w) => w.path as LatLon[]).filter((p) => p.length > 1),
    });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function newestFirst(discoveries: Discovery[]): Discovery[] {
  return [...discoveries].sort((a, b) => b.at - a.at);
}

// "2026-11-02" -> local Date at noon (avoids timezone day shifts).
export function parseDayKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
}

export function formatDay(key: string, lang: string): string {
  const d = parseDayKey(key);
  if (!d) return key;
  try {
    return d.toLocaleDateString(lang, { weekday: "short", month: "short", day: "numeric" });
  } catch {
    return key;
  }
}
