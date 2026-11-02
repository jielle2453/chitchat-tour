import { z } from "zod";
import type { Confidence, HometownComparison, KnowledgeItem, Lang, LocalizedText, Source, TraceKind, TraceStep, UserProfile } from "@/lib/types";

export class Trace {
  steps: TraceStep[] = [];
  add(kind: TraceKind, message: string, data?: unknown): void {
    this.steps.push({ kind, message, at: Date.now(), ...(data === undefined ? {} : { data }) });
  }
}

export const LANG_NAME: Record<Lang, string> = {
  en: "English",
  ja: "Japanese",
  "zh-TW": "Traditional Chinese (Taiwan)",
  ko: "Korean",
};

export const LENGTH_HINT: Record<Lang, string> = {
  en: "about 45 to 70 words",
  ja: "about 70 to 120 characters",
  "zh-TW": "about 70 to 120 characters",
  ko: "about 70 to 120 characters",
};

export function pickText(t: LocalizedText | null | undefined, lang: Lang): { text: string; lang: Lang } | null {
  if (!t) return null;
  const own = t[lang];
  if (own) return { text: own, lang };
  return t.en ? { text: t.en, lang: "en" } : null;
}

export function usableComparison(item: KnowledgeItem, profile: UserProfile): HometownComparison | null {
  const c = item.hometown?.[profile.hometown];
  if (!c || !c.comparison) return null;
  if (c.status === "absent" || c.status === "unknown") return null;
  return c;
}

export function itemSources(item: KnowledgeItem, profile: UserProfile): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const s of [...item.sources, ...(usableComparison(item, profile)?.sources ?? [])]) {
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    out.push(s);
  }
  return out;
}

export function itemConfidence(item: KnowledgeItem, profile: UserProfile): Confidence {
  const rank: Confidence[] = ["low", "medium", "high"];
  const c = usableComparison(item, profile)?.confidence;
  let r = rank.indexOf(item.confidence);
  if (c) r = Math.min(r, rank.indexOf(c));
  if (item.disputed) r = Math.min(r, 1);
  return rank[r];
}

// Short spoken openers, rotated per item so consecutive narrations don't start alike.
// They carry no facts: the verified KB fact always does the talking.
const OPENERS: Record<Lang, string[]> = {
  en: ["Quick one while we walk — ", "Here's a good one: ", "Listen to this — ", "This one's worth knowing: ", "While we're passing this — "],
  ja: ["歩きながらどうぞ。小ネタですけど、", "これ、いい話なんですよ。", "ちょっと聞いてください。", "これ、知ってると楽しいですよ。", "通りすがりにどうぞ。"],
  "zh-TW": ["邊走邊聽，這個很妙，", "欸，跟你說一個，", "這個你一定沒想到，", "經過這裡剛好講一下，", "來，這個很有梗，"],
  ko: ["걸으면서 하나만요. ", "이거 재밌어요. ", "잠깐 들어보세요. ", "이건 알아두면 좋아요. ", "지나가며 하나만요. "],
};

// Light contrast lead-ins, kept modest ("often"): the KB comparison does the talking.
const CONTRASTS: Record<Lang, string[]> = {
  en: [" Elsewhere it's often different: ", " In other places it's often different: "],
  ja: ["ほかの場所では少し違うことも多いです。", "ちなみに、ほかの場所ではこういうことも多いです。"],
  "zh-TW": ["換個地方，做法常常不一樣：", "其他地方，常常是另一套做法："],
  ko: ["다른 곳에서는 꽤 다른 경우가 많아요. ", "다른 곳에서는 흔히 다르답니다. "],
};

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

export function openerFor(lang: Lang, itemId: string): string {
  const list = OPENERS[lang];
  return list[hashId(`open:${itemId}`) % list.length];
}

export function contrastFor(lang: Lang, itemId: string): string {
  const list = CONTRASTS[lang];
  return list[hashId(`contrast:${itemId}`) % list.length];
}

const T = {
  disputed: {
    en: "There are several stories about this.",
    ja: "これについてはいくつかの説があります。",
    "zh-TW": "關於這件事有好幾種說法。",
    ko: "이에 대해서는 여러 가지 이야기가 있습니다.",
  },
  caveat: {
    en: "Take it as one explanation, not the whole story.",
    ja: "あくまで一つの見方です。",
    "zh-TW": "這只是其中一種解釋。",
    ko: "하나의 설명일 뿐입니다.",
  },
  noSource: {
    en: "I couldn't find a reliable source for that, so I'd rather not guess.",
    ja: "それについては信頼できる情報源が見つからなかったので、推測では話さないでおきますね。",
    "zh-TW": "這件事我找不到可靠的出處，所以不想亂猜。",
    ko: "그것에 대해서는 믿을 만한 출처를 찾지 못해서 추측하지 않을게요.",
  },
} as const;

export const MSG = T;

// First sentence of a KB text, shortened for an on-screen chip.
function firstSentence(text: string, max = 40): string {
  const s = text.split(/(?<=[。．.!?！？])\s*/)[0] ?? text;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// Short "here | elsewhere" chip lines built only from verified KB fields.
export function contrastFromItem(item: KnowledgeItem, profile: UserProfile, lang: Lang): { here: string; elsewhere: string } | null {
  const cmp = usableComparison(item, profile);
  const cmpText = cmp ? pickText(cmp.comparison, lang)?.text : null;
  if (!cmpText) return null;
  return { here: firstSentence(pickText(item.fact, lang)!.text), elsewhere: firstSentence(cmpText) };
}

// Spoken text built only from verified KB fields.
export function composeFromItem(item: KnowledgeItem, profile: UserProfile): { title: string; text: string; lang: Lang; fellBack: boolean } {
  const title = pickText(item.title, profile.lang)!;
  const fact = pickText(item.fact, profile.lang)!;
  const cmp = usableComparison(item, profile);
  const cmpText = cmp ? pickText(cmp.comparison, profile.lang) : null;
  // The narration is spoken in one language: use the requested one only if everything has it.
  const lang: Lang = [title, fact, ...(cmpText ? [cmpText] : [])].every((p) => p.lang === profile.lang) ? profile.lang : "en";
  const pick = (t: LocalizedText | null | undefined) => pickText(t, lang)!.text;
  const sep = lang === "en" || lang === "ko" ? " " : "";
  const parts = [openerFor(lang, item.id)];
  if (item.disputed) parts.push(T.disputed[lang]);
  parts.push(pick(item.fact));
  if (cmp) parts.push(contrastFor(lang, item.id) + pick(cmp.comparison));
  return { title: pick(item.title), text: parts.join(sep), lang, fellBack: lang !== profile.lang };
}

export function stripFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

// Extract one JSON object from raw model output. Handles code fences,
// leading/trailing prose, and a truncated trailing string (closed only in
// the safe case: output ends inside a top-level string with no unclosed
// brackets). Throws when nothing usable can be recovered.
export function extractJsonObject(raw: string): string {
  const text = raw
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = text.indexOf("{");
  if (start < 0) throw new Error("No JSON object in model output");
  let depth = 0;
  let bracketDepth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') {
      inStr = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && bracketDepth === 0) return text.slice(start, i + 1);
      if (depth < 0) throw new Error("No JSON object in model output");
    } else if (ch === "[") {
      bracketDepth++;
    } else if (ch === "]") {
      bracketDepth--;
    }
  }
  // Ran off the end: repair only safe truncations of the top-level shape
  // (no unclosed arrays). Either the cut landed inside a trailing string, or
  // the value just before the cut is already complete (only braces missing).
  if (bracketDepth === 0 && depth > 0) {
    let fixed = text.slice(start);
    if (inStr) {
      if (fixed.endsWith("\\")) fixed = fixed.slice(0, -1);
      fixed += '"';
    } else if (!/["\d}\]A-Za-z]$/.test(fixed)) {
      throw new Error(`Unterminated string in JSON at position ${text.length}`);
    }
    return `${fixed}${"}".repeat(depth)}`;
  }
  throw new Error(`Unterminated string in JSON at position ${text.length}`);
}

// Parse + validate one JSON object from raw model output, tolerating fences,
// prose wrapping, and safe truncation repair. Throws on failure.
export function parseModelJson<T>(raw: string, schema: z.ZodType<T>): T {
  return schema.parse(JSON.parse(extractJsonObject(raw)));
}

export function compass(deg: number | undefined): string {
  if (deg === undefined || Number.isNaN(deg)) return "";
  const names = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  return names[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}
