// Localized discovery eyebrow: origin plus a human category. Live-researched
// discoveries (itemId "live:…") show "just looked up" instead of "other".
"use client";
import { t } from "./i18n";
import type { Lang, Narration } from "@/lib/types";

const CAT_KEY = {
  street: "catStreet",
  transport: "catTransport",
  shop: "catShop",
  architecture: "catArchitecture",
  "daily-life": "catDailyLife",
  other: "catOther",
} as const;

export function isLiveDiscovery(itemId: string | null | undefined): boolean {
  return !!itemId && itemId.startsWith("live:");
}

export function categoryLabel(lang: Lang, category: NonNullable<Narration["category"]>): string {
  return t(lang, CAT_KEY[category] ?? "catOther");
}

const ORIGIN_KEY = { guide: "originGuide", ask: "originAsk", photo: "originPhoto" } as const;

export function discoveryEyebrow(lang: Lang, origin: keyof typeof ORIGIN_KEY, narration: Pick<Narration, "category" | "itemId">): string {
  const second = isLiveDiscovery(narration.itemId) ? t(lang, "liveNew") : narration.category ? categoryLabel(lang, narration.category) : null;
  return [t(lang, ORIGIN_KEY[origin]), second].filter(Boolean).join(" · ");
}
