import type { GeoFix, KnowledgeItem } from "@/lib/types";

export const items: KnowledgeItem[] = [
  {
    id: "garbage-truck",
    category: "daily-life",
    layer: "area",
    trigger: { osm: [], photo_concepts: ["garbage truck"] },
    title: { en: "Why Taipei's garbage trucks play music", "zh-TW": "台北垃圾車為什麼放音樂" },
    fact: { en: "The music tells residents the truck has arrived so they carry bags out.", "zh-TW": "音樂是在通知居民垃圾車到了。" },
    sources: [{ url: "https://taiwaninsight.org/x", title: "Taiwan Insight", verified: "full-text" }],
    confidence: "medium",
    disputed: false,
    caveats: null,
    hometown: {
      JP: { status: "different", comparison: { en: "In Tokyo you drop bags at a fixed spot in the morning.", ja: "東京では朝、決まった場所にゴミを出しますよね。" }, sources: [] },
      US: { status: "unknown", comparison: null, sources: [] },
    },
  },
  {
    id: "disputed-thing",
    category: "street",
    layer: "point",
    trigger: { osm: [] },
    title: { en: "The red lanterns" },
    fact: { en: "Nobody agrees why they hang here." },
    sources: [{ url: "https://en.wikipedia.org/wiki/Lantern", title: "Lantern" }],
    confidence: "low",
    disputed: true,
    caveats: "contested",
    hometown: {},
  },
];

export const fix: GeoFix = { lat: 25.033, lon: 121.529, accuracy: 10, heading: 90, speed: 1.2, timestamp: 1, simulated: true };
