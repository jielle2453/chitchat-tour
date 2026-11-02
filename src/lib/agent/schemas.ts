import { z } from "zod";

const lang = z.enum(["en", "ja", "zh-TW", "ko"]);
const profile = z.object({ hometown: z.string().min(2).max(8), lang });
const fix = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  accuracy: z.number(),
  heading: z.number().nullable(),
  speed: z.number().nullable(),
  timestamp: z.number(),
  simulated: z.boolean().optional(),
});
const source = z.object({ url: z.string(), title: z.string(), publisher: z.string().optional(), verified: z.enum(["full-text", "snippet", "web_search"]).optional() });
const narration = z.object({
  id: z.string(),
  itemId: z.string().nullable(),
  title: z.string(),
  text: z.string(),
  lang,
  sources: z.array(source),
  confidence: z.enum(["high", "medium", "low"]),
});

export const guideSchema = z.object({
  profile,
  fix,
  candidates: z
    .array(
      z.object({
        itemId: z.string(),
        poiId: z.string().optional(),
        distanceM: z.number().optional(),
        bearingDeg: z.number().optional(),
        score: z.number(),
        reasons: z.array(z.string()),
      }),
    )
    .max(50),
  state: z.object({
    toldItemIds: z.array(z.string()),
    lastSpokenAt: z.number().nullable(),
    history: z.array(z.object({ itemId: z.string(), at: z.number() })),
  }),
  areaName: z.string().nullish(),
});

export const askSchema = z.object({
  profile,
  question: z.string().trim().min(1).max(500),
  fix: fix.optional(),
  recent: z.array(narration).max(20),
});

export const explainSchema = z.object({
  profile,
  label: z.string().trim().min(1).max(120),
  itemId: z.string().max(120).optional(),
  fix: fix.optional(),
});

const poi = z.object({
  id: z.string().min(1).max(120),
  kind: z.enum(["convenience", "traffic_signals", "bus_stop", "place_of_worship", "bicycle_rental", "marketplace", "subway_entrance", "other"]),
  name: z.string().max(200).optional(),
  brand: z.string().max(200).optional(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  tags: z.record(z.string(), z.string()),
});

export const discoverSchema = z.object({
  profile,
  poi,
  fix,
});

export type DiscoverRequest = z.infer<typeof discoverSchema>;
