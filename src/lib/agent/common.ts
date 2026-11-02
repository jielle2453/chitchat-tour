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
  en: "about 90 to 150 words",
  ja: "about 150 to 250 characters",
  "zh-TW": "about 150 to 250 characters",
  ko: "about 150 to 250 characters",
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

const T = {
  hook: {
    en: (title: string) => `Have you noticed this? ${title}.`,
    ja: (title: string) => `気づきましたか？${title}。`,
    "zh-TW": (title: string) => `你有注意到嗎？${title}。`,
    ko: (title: string) => `혹시 눈치채셨나요? ${title}.`,
  },
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
  hometown: {
    en: "Elsewhere it's often different. ",
    ja: "ほかの場所では、少し違うことも多いです。",
    "zh-TW": "換個地方，做法常常不一樣。",
    ko: "다른 곳에서는 꽤 다른 경우가 많아요. ",
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
  const parts = [T.hook[lang](pick(item.title))];
  if (item.disputed) parts.push(T.disputed[lang]);
  parts.push(pick(item.fact));
  if (cmp) parts.push(T.hometown[lang] + pick(cmp.comparison));
  return { title: pick(item.title), text: parts.join(sep), lang, fellBack: lang !== profile.lang };
}

export function stripFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export function compass(deg: number | undefined): string {
  if (deg === undefined || Number.isNaN(deg)) return "";
  const names = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  return names[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}
