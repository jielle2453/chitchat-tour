// Pure notebook helpers for the walks + themes views: place labels, dates,
// durations, theme grouping. No browser APIs.
import type { Discovery, Lang, WalkRecord } from "@/lib/types";
import { areaLabel } from "@/lib/geo";
import { t } from "./i18n";
import { isLiveDiscovery } from "./categories";

export type ThemeKey = "street" | "transport" | "shop" | "architecture" | "daily-life" | "other" | "live";

export const THEME_KEYS: ThemeKey[] = ["street", "transport", "shop", "architecture", "daily-life", "other", "live"];

// Fixed theme order for the themes view; only themes that have items are shown.
const THEME_ORDER: ThemeKey[] = ["street", "transport", "shop", "architecture", "daily-life", "live", "other"];

export function themeKeyOf(d: Discovery): ThemeKey {
  if (isLiveDiscovery(d.narration.itemId)) return "live";
  const c = d.narration.category;
  return c === "street" || c === "transport" || c === "shop" || c === "architecture" || c === "daily-life" ? c : "other";
}

export type ThemeGroup = { key: ThemeKey; items: Discovery[] }; // items oldest first

export function groupByTheme(discoveries: Discovery[]): ThemeGroup[] {
  const map = new Map<ThemeKey, Discovery[]>();
  for (const d of [...discoveries].sort((a, b) => a.at - b.at)) {
    const k = themeKeyOf(d);
    map.set(k, [...(map.get(k) ?? []), d]);
  }
  // Most-collected theme first; ties keep the fixed theme order (stable sort).
  return THEME_ORDER.filter((k) => map.has(k))
    .map((k) => ({ key: k, items: map.get(k)! }))
    .sort((a, b) => b.items.length - a.items.length);
}

export function themeName(lang: Lang, key: ThemeKey): string {
  if (key === "live") return t(lang, "nbThemeLive");
  return t(lang, key === "street" ? "catStreet" : key === "transport" ? "catTransport" : key === "shop" ? "catShop" : key === "architecture" ? "catArchitecture" : key === "daily-life" ? "catDailyLife" : "catOther");
}

// Structured ticket title: area + optional destination. The card renders the
// arrow as a lucide icon, never the → glyph.
export function walkPlaceParts(walk: WalkRecord, lang: Lang): { area: string | null; dest: string | null } {
  const area = areaLabel(walk.areaName, lang);
  const dest = walk.mode === "destination" && walk.destination?.name?.trim() ? walk.destination.name : null;
  return { area, dest };
}

// "永康街 → 東門市場" for destination walks, otherwise the area name.
export function walkPlaceLabel(walk: WalkRecord, lang: Lang): string {
  const { area, dest } = walkPlaceParts(walk, lang);
  if (dest) return area ? `${area} → ${dest}` : dest;
  return area ?? t(lang, "unknownArea");
}

// Ticket date: localized short form, e.g. "11月3日週二" / "Tue, Nov 3".
export function formatTicketDate(ms: number, lang: Lang): string {
  try {
    return new Date(ms).toLocaleDateString(lang, { month: "long", day: "numeric", weekday: "short" });
  } catch {
    return new Date(ms).toLocaleDateString("en", { month: "numeric", day: "numeric", weekday: "short" });
  }
}

export function walkDurationMin(walk: WalkRecord, now: number): number {
  const end = typeof walk.endedAt === "number" ? walk.endedAt : now;
  return Math.max(0, Math.round((end - walk.startedAt) / 60_000));
}

export function formatDuration(min: number, lang: Lang): string {
  if (min < 60) return t(lang, "nbMin", { n: min });
  return t(lang, "nbHourMin", { h: Math.floor(min / 60), m: min % 60 });
}

export function newestWalksFirst(walks: WalkRecord[]): WalkRecord[] {
  return [...walks].sort((a, b) => b.startedAt - a.startedAt);
}

// Compact duration for the ticket meta line: "32 分" / "32 min",
// "1 小時 5 分" — never repeats the date.
export function formatDurationShort(min: number, lang: Lang): string {
  if (min < 60) return t(lang, "nbMinShort", { n: min });
  return t(lang, "nbHourMinShort", { h: Math.floor(min / 60), m: min % 60 });
}

// Fixed stub parts (no Intl variance across runtimes): weekday + day number
// + month, e.g. { 週一, 3, 11月 } / { Mon, 3, Nov }.
export interface TicketStubParts {
  weekday: string;
  day: string;
  month: string;
}

const EN_MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EN_MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const EN_WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ZH_WEEKDAYS = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
const JA_WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function ticketStubParts(ms: number, lang: Lang): TicketStubParts {
  const d = new Date(ms);
  const day = String(d.getDate());
  if (lang === "zh-TW") return { weekday: ZH_WEEKDAYS[d.getDay()], day, month: `${d.getMonth() + 1}月` };
  if (lang === "ja") return { weekday: JA_WEEKDAYS[d.getDay()], day, month: `${d.getMonth() + 1}月` };
  return { weekday: EN_WEEKDAYS_SHORT[d.getDay()], day, month: EN_MONTHS_SHORT[d.getMonth()] };
}

// Month section title above the ticket list: "2026年11月" / "November 2026".
export function formatMonthTitle(year: number, month: number, lang: Lang): string {
  if (lang === "zh-TW" || lang === "ja") return `${year}年${month}月`;
  return `${EN_MONTHS_LONG[month - 1]} ${year}`;
}

export interface WalkMonthGroup {
  key: string; // "2026-11", local calendar
  year: number;
  month: number; // 1-12
  walks: WalkRecord[]; // newest first
}

// Walks grouped by local month, newest month first.
export function groupWalksByMonth(walks: WalkRecord[]): WalkMonthGroup[] {
  const groups: WalkMonthGroup[] = [];
  for (const w of newestWalksFirst(walks)) {
    const d = new Date(w.startedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.walks.push(w);
    else groups.push({ key, year: d.getFullYear(), month: d.getMonth() + 1, walks: [w] });
  }
  return groups;
}
