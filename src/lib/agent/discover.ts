import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getKnowledgeItems } from "@/lib/kb";
import { isMockMode } from "@/lib/meta/client";
import type { Confidence, KnowledgeItem, Lang, Narration, Poi, Source, TraceStep, UserProfile } from "@/lib/types";
import { extractCitations, trustedSources } from "@/lib/verify";
import { rankSources } from "./ask";
import { LANG_NAME, LENGTH_HINT, parseModelJson, Trace } from "./common";
import { MAX_TOOL_CALLS } from "./guard";
import { responsesText } from "./llm";
import type { DiscoverRequest } from "./schemas";

// Second narration layer: ahead-of-time research on real nearby places the
// hand-verified knowledge base does not cover. Same Narration contract, but
// itemId is null (KB handles it) or a synthetic `live:<poiId>`.

export interface DiscoverResponse {
  narration: Narration | null;
  trace: TraceStep[];
}

function newId(): string {
  return `d_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const FALLBACK_SYSTEM =
  "You are Chitchat Tour, a friendly local friend. Research one specific place in Taipei and tell one short surprising visible everyday fact about it in the visitor's language. Use web search; never state what you cannot source; if no reliable source, say so honestly. Reply with JSON only.";

async function loadDiscoverPrompt(): Promise<string> {
  try {
    return (await readFile(path.join(process.cwd(), "prompts", "discover-system.md"), "utf8")).trim();
  } catch {
    return FALLBACK_SYSTEM;
  }
}

// ---- KB coverage: a POI the KB already matches belongs to the KB layer ----

// Same matching semantics as the trigger engine's poiMatches (kept local so
// neither module depends on the other's internals).
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

export function kbCoveringItem(poi: Poi): KnowledgeItem | null {
  for (const item of getKnowledgeItems()) {
    if (item.layer !== "point" || item.trigger.osm.length === 0) continue;
    if (poiMatches(poi, item.trigger.osm)) return item;
  }
  return null;
}

function tooLong(text: string, lang: Lang): boolean {
  return lang === "en" ? text.split(/\s+/).length > 100 : text.length > 170;
}

// Trim to spoken length without adding facts (only when the model ran long).
async function shape(text: string, lang: Lang, trace: Trace): Promise<string> {
  try {
    const { text: out } = await responsesText({
      instructions: `Rewrite the text for speaking aloud in ${LANG_NAME[lang]}, ${LENGTH_HINT[lang]}. Keep every claim, add no new facts, numbers or claims. Plain sentences, no markdown, no lists, no URLs. Output only the rewritten text.`,
      input: text,
      max_output_tokens: 800,
    });
    if (out) {
      trace.add("decision", `Shaped the narration to spoken length in ${LANG_NAME[lang]}.`);
      return out;
    }
  } catch {
    trace.add("error", "Shaping step failed; using the unshaped text.");
  }
  return text;
}

// ---- mock mode: canned narrations for two common kinds, quiet otherwise ----

interface Canned {
  title: Record<Lang, string>;
  text: Record<Lang, string>;
}

const CANNED_WORSHIP: Canned = {
  title: { en: "The temple furnace", ja: "お寺の金炉", "zh-TW": "廟的金爐", ko: "사원의 소각로" },
  text: {
    en: "That curl of smoke isn't a barbecue — it's ghost money burning for the temple's gods, fed into a tall gold furnace so no ash touches the street. In many cities offerings stay indoors; here the sidewalk is part of the altar.",
    ja: "あの煙、バーベキューじゃないんです。神様へのお供えのお金を、灰が道に散らないよう背の高い炉で燃やしているんですよ。お供えが歩道まではみ出すなんて、なかなかないでしょう。",
    "zh-TW": "那陣煙不是在烤肉，是在燒金紙給神明，而且是用高高的金爐燒，灰不會掉到街上。很多地方供品都擺室內，在這裡，人行道也是祭壇的一部分。",
    ko: "저 연기는 바비큐가 아니에요. 신에게 바치는 돈을 재가 거리에 흩날리지 않게 높은 용광로에서 태우는 거예요. 어떤 도시에서는 제물이 실내에 머물지만, 여기서는 인도가 제단의 일부예요.",
  },
};

const CANNED_PARK: Canned = {
  title: { en: "The living-room park", ja: "青空のリビング", "zh-TW": "露天客廳", ko: "노천 거실" },
  text: {
    en: "See how the uncles play chess like it's a contact sport? Taipei's pocket parks double as open-air living rooms — retired neighbours claim the same stone table every morning. In many cities parks are for jogging past; here they're for staying put.",
    ja: "おじさんたちの将棋、ケンカみたいに真剣でしょう。台北の小さな公園は青空のリビングなんです。毎朝ご近所さんが同じ石のテーブルに集まるんですよ。",
    "zh-TW": "你看那些阿伯下棋下得跟打架一樣認真。台北的小公園根本是露天客廳，退休的鄰居每天早上都佔同一張石桌。很多地方的公園是拿來路過運動的，在這裡是拿來久坐的。",
    ko: "아저씨들이 몸싸움하듯 장기를 두는 게 보이세요? 타이베이의 작은 공원은 노천 거실을 겸해요. 은퇴한 이웃들이 매일 아침 같은 돌 테이블을 차지하죠.",
  },
};

function cannedFor(poi: Poi): Canned | null {
  if (poi.kind === "place_of_worship") return CANNED_WORSHIP;
  const leisure = (poi.tags.leisure ?? "").toLowerCase();
  if (leisure === "park" || leisure === "garden" || leisure === "playground") return CANNED_PARK;
  return null;
}

function mockNarration(poi: Poi, profile: UserProfile, canned: Canned, trace: Trace): Narration {
  trace.add("decision", "Mock mode: no model call; using a canned narration for this kind of place.");
  const lang: Lang = canned.text[profile.lang] ? profile.lang : "en";
  if (lang !== profile.lang) trace.add("decision", `No ${LANG_NAME[profile.lang]} text for this place; using English instead.`);
  return {
    id: newId(),
    itemId: `live:${poi.id}`,
    title: canned.title[lang] ?? canned.title.en,
    text: canned.text[lang] ?? canned.text.en,
    lang,
    sources: [],
    confidence: "low",
    category: "other",
  };
}

// ---- live research via Muse Spark + web_search ----

const AnswerSchema = z.object({ found: z.boolean(), title: z.string(), answer: z.string(), used_urls: z.array(z.string()) });

const ANSWER_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["found", "title", "answer", "used_urls"],
  properties: {
    found: { type: "boolean" },
    title: { type: "string" },
    answer: { type: "string" },
    used_urls: { type: "array", items: { type: "string" } },
  },
} as const;

const MAX_SOURCES = 3;

function noSource(profile: UserProfile, title: string, trace: Trace, why: string): null {
  trace.add("verify", why);
  trace.add("decision", "No reliable source for this place; staying quiet.");
  return null;
}

function describePoi(poi: Poi): string {
  const tags = Object.entries(poi.tags)
    .filter(([k]) => !k.startsWith("name") || k === "name")
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return `name: ${poi.name ?? poi.brand ?? "(unnamed)"}; kind: ${poi.kind}; tags: ${tags || "(none)"}; position: ${poi.lat.toFixed(5)}, ${poi.lon.toFixed(5)}`;
}

export async function runDiscover(req: DiscoverRequest): Promise<DiscoverResponse> {
  const trace = new Trace();
  const { profile, poi, fix } = req;
  const label = poi.name ?? poi.brand ?? poi.kind;
  trace.add("user", `Researching ahead: ${label} (${poi.kind}) at ${poi.lat.toFixed(5)}, ${poi.lon.toFixed(5)}.`);

  const covered = kbCoveringItem(poi);
  if (covered) {
    trace.add("skip", `"${label}" is already covered by the knowledge base ("${covered.id}"); the KB handles it.`);
    return { narration: null, trace: trace.steps };
  }

  if (isMockMode()) {
    const canned = cannedFor(poi);
    if (!canned) {
      trace.add("decision", "Mock mode: no canned narration for this kind of place; staying quiet.");
      return { narration: null, trace: trace.steps };
    }
    return { narration: mockNarration(poi, profile, canned, trace), trace: trace.steps };
  }

  const system = await loadDiscoverPrompt();
  const taipei = Math.abs(fix.lat - 25.03) < 0.5 && Math.abs(fix.lon - 121.55) < 0.5;
  const tool: Record<string, unknown> = { type: "web_search", search_context_size: "low" };
  if (taipei) tool.user_location = { type: "approximate", country: "TW", city: "Taipei", timezone: "Asia/Taipei" };

  trace.add("decision", `Not in the knowledge base: researching "${label}" on the web.`);
  let answer: z.infer<typeof AnswerSchema>;
  let sources: Source[];
  try {
    const { text: out, raw } = await responsesText({
      instructions: `${system}\n\nAnswer in ${LANG_NAME[profile.lang]}, ${LENGTH_HINT[profile.lang]}. The visitor's hometown is ${profile.hometown}. The visitor is walking in Taipei, Taiwan; answer about this Taipei place.\n\nReply as JSON. found: false when no reliable source supports an answer (then answer says so honestly). title: a short heading in the answer language naming the place, at most 16 characters (6 words in English). answer: the spoken narration. used_urls: the URLs of the search results the answer relies on.`,
      input: `Place ahead on the walk:\n${describePoi(poi)}\n\nFind one surprising, visible, everyday fact about this specific place — or about this kind of place in Taipei when the place itself has no documented story — plus a comparison with ${profile.hometown} only when you can source it.`,
      tools: [tool],
      include: ["web_search_call.action.sources", "web_search_call.results"],
      max_tool_calls: MAX_TOOL_CALLS,
      max_output_tokens: 2500,
      text: { format: { type: "json_schema", name: "discover_answer", strict: true, schema: ANSWER_JSON_SCHEMA } },
    });
    answer = parseModelJson(out, AnswerSchema);
    const citations = extractCitations(raw);
    const trusted = trustedSources(citations);
    sources = rankSources(trusted, answer.used_urls).slice(0, MAX_SOURCES);
    trace.add("verify", `${citations.length} page(s) read; ${trusted.length} from trusted domains; the model relied on ${answer.used_urls.length}.`, {
      kept: sources.map((s) => s.url),
      dropped: citations.filter((c) => !trusted.some((s) => s.url === c.url)).map((c) => c.url),
    });
  } catch (err) {
    trace.add("error", `Research call failed (${err instanceof Error ? err.message.slice(0, 120) : "unknown error"}).`);
    return { narration: null, trace: trace.steps };
  }

  const heading = answer.title.trim() || label;
  if (!answer.found) {
    trace.add("verify", "The model found no reliable source for this place.");
    noSource(profile, heading, trace, "Nothing reliable to say about this place.");
    return { narration: null, trace: trace.steps };
  }
  let text = answer.answer.trim();
  if (!text || sources.length === 0) {
    noSource(profile, heading, trace, "No citation from a trusted domain; will not state unsourced facts.");
    return { narration: null, trace: trace.steps };
  }
  if (tooLong(text, profile.lang)) text = await shape(text, profile.lang, trace);
  const confidence: Confidence = "medium";
  trace.add("decision", `Ready: "${heading}" — for when the walker gets there.`);
  return {
    narration: { id: newId(), itemId: `live:${poi.id}`, title: heading, text, lang: profile.lang, sources, confidence, category: "other" },
    trace: trace.steps,
  };
}
