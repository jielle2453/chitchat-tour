import "server-only";
import { z } from "zod";
import { getItem, getKnowledgeItems } from "@/lib/kb";
import { isMockMode } from "@/lib/meta/client";
import type { AskRequest, AskResponse, ExplainRequest, GeoFix, KnowledgeItem, Lang, Narration, Source, UserProfile } from "@/lib/types";
import { canonicalSite, canonicalUrlKey, extractCitations, trustedSources } from "@/lib/verify";
import { composeFromItem, itemConfidence, itemSources, LANG_NAME, LENGTH_HINT, MSG, parseModelJson, Trace } from "./common";
import { MAX_TOOL_CALLS } from "./guard";
import { responsesText } from "./llm";
import { loadPrompt } from "./prompts";

function newId(): string {
  return `a_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function tooLong(text: string, lang: Lang): boolean {
  return lang === "en" ? text.split(/\s+/).length > 100 : text.length > 170;
}

function kbNarration(item: KnowledgeItem, profile: UserProfile, text: string, title: string, lang: Lang): Narration {
  return { id: newId(), itemId: item.id, title, text, lang, sources: itemSources(item, profile), confidence: itemConfidence(item, profile) };
}

// Step 2 of the two-step flow: trim / translate to spoken length without adding facts.
async function shape(text: string, lang: Lang, trace: Trace): Promise<string> {
  try {
    const { text: out } = await responsesText({
      instructions: `Rewrite the text for speaking aloud in ${LANG_NAME[lang]}, ${LENGTH_HINT[lang]}. Keep every claim, add no new facts, numbers or claims, keep hedges such as "one analysis suggests" or "there are several stories". Plain sentences, no markdown, no lists, no URLs. Output only the rewritten text.`,
      input: text,
      max_output_tokens: 800,
    });
    if (out) {
      trace.add("decision", `Shaped the answer to spoken length in ${LANG_NAME[lang]}.`);
      return out;
    }
  } catch {
    trace.add("error", "Shaping step failed; using the unshaped text.");
  }
  return text;
}

async function answerFromItem(item: KnowledgeItem, profile: UserProfile, trace: Trace): Promise<Narration> {
  const c = composeFromItem(item, profile);
  let { text, lang } = c;
  if (c.fellBack) {
    if (isMockMode()) {
      trace.add("decision", `No ${LANG_NAME[profile.lang]} text for this item; using English instead.`);
    } else {
      text = await shape(c.text, profile.lang, trace);
      lang = profile.lang;
    }
  }
  trace.add("verify", `Answered from the verified knowledge base with ${itemSources(item, profile).length} source(s); no web search needed.`);
  return kbNarration(item, profile, text, c.title, lang);
}

function noSource(profile: UserProfile, title: string, trace: Trace, why: string): Narration {
  trace.add("verify", why);
  trace.add("decision", "Saying honestly that no reliable source was found.");
  return { id: newId(), itemId: null, title, text: MSG.noSource[profile.lang], lang: profile.lang, sources: [], confidence: "low" };
}

async function webAnswer(opts: { profile: UserProfile; prompt: string; title: string; fix?: GeoFix; trace: Trace }): Promise<Narration> {
  const { profile, prompt, title, fix, trace } = opts;
  const system = await loadPrompt("ask-system.md");
  const taipei = !fix || (Math.abs(fix.lat - 25.03) < 0.5 && Math.abs(fix.lon - 121.55) < 0.5);
  const tool: Record<string, unknown> = { type: "web_search", search_context_size: "low" };
  if (taipei) tool.user_location = { type: "approximate", country: "TW", city: "Taipei", timezone: "Asia/Taipei" };

  const place = taipei ? "\nThe visitor is walking in Taipei, Taiwan; answer about Taipei and Taiwan." : "";

  trace.add("decision", "Not in the knowledge base: searching the web.");
  let answer: WebAnswer;
  let sources: Source[];
  try {
    const { text: out, raw } = await responsesText({
      instructions: `${system}\n\nAnswer in ${LANG_NAME[profile.lang]}, ${LENGTH_HINT[profile.lang]}. The visitor's hometown is ${profile.hometown}.${place}\n\n${ANSWER_FIELDS}`,
      input: prompt,
      tools: [tool],
      include: ["web_search_call.action.sources", "web_search_call.results"],
      max_tool_calls: MAX_TOOL_CALLS,
      max_output_tokens: 2500,
      text: { format: { type: "json_schema", name: "sourced_answer", strict: true, schema: ANSWER_JSON_SCHEMA } },
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
    trace.add("error", `Web search call failed (${err instanceof Error ? err.message.slice(0, 120) : "unknown error"}).`);
    return noSource(profile, title, trace, "No answer could be sourced.");
  }

  const heading = answer.title.trim() || title;
  if (!answer.found) {
    trace.add("verify", "The model found no reliable source.");
    trace.add("decision", "Saying honestly that no reliable source was found.");
    const text = answer.answer.trim() || MSG.noSource[profile.lang];
    return { id: newId(), itemId: null, title: heading, text, lang: profile.lang, sources: [], confidence: "low" };
  }
  let text = answer.answer.trim();
  if (!text || sources.length === 0) return noSource(profile, heading, trace, "No citation from a trusted domain; will not state unsourced facts.");
  if (tooLong(text, profile.lang)) text = await shape(text, profile.lang, trace);
  return { id: newId(), itemId: null, title: heading, text, lang: profile.lang, sources, confidence: "medium" };
}

const MAX_SOURCES = 3;

const ANSWER_FIELDS =
  "Reply as JSON. found: false when no reliable source supports an answer (then answer says so honestly). " +
  "title: a short heading in the answer language naming the thing, at most 16 characters (6 words in English). " +
  "answer: the spoken answer. used_urls: the URLs of the search results your answer relies on.";

const AnswerSchema = z.object({ found: z.boolean(), title: z.string(), answer: z.string(), used_urls: z.array(z.string()) });
type WebAnswer = z.infer<typeof AnswerSchema>;

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

// The URLs the model lists rarely match the search results byte for byte, so
// compare canonical keys, falling back to the same registrable site (an AMP or
// section subdomain, or another Wikipedia language edition, is the same
// outlet). Trusted pages from sites the model did not rely on are dropped:
// showing them would imply support they don't give. Only trusted entries can
// ever be kept; untrusted used_urls just match nothing.
export function rankSources(trusted: Source[], usedUrls: string[]): Source[] {
  const used = new Set(usedUrls.map(canonicalUrlKey));
  const usedSites = new Set(usedUrls.map(canonicalSite).filter((s): s is string => s !== null));
  const score = (s: Source) => {
    if (used.has(canonicalUrlKey(s.url))) return 2;
    const site = canonicalSite(s.url);
    return site !== null && usedSites.has(site) ? 1 : 0;
  };
  return trusted
    .map((s, i) => ({ s, i, k: score(s) }))
    .filter((x) => x.k > 0)
    .sort((a, b) => b.k - a.k || a.i - b.i)
    .map((x) => x.s);
}

// ---- Knowledge-base-first matching (mock mode and real mode) ----

// Deterministic match over titles, photo concepts and ids in all languages,
// so a verified topic answers from the KB without a web search. It is
// deliberately conservative (high precision): fact text never scores (it is
// long and generic, and scoring it caused false positives), common words
// carry almost no weight, and a match needs at least two distinct question
// terms. Anything uncertain returns null; in real mode one short model call
// decides those. A generic question elects the parent item; a facet wins
// only when the question carries a facet-specific signal.

// Short words that add no topical signal. Applied to KB titles as well as
// the question, so modal verbs ("can") and pronouns never elect an item.
const LATIN_STOP = new Set(
  "the are you why how what who whom whose our out can may not but for nor yet and any all has had did was were been him her his she one two with from that this these those them their there then than have does about into over under your much many more most some such just like here also very will would could should whats thats dont doesnt isnt arent wheres when where which while".split(" "),
);

// Interrogatives carry no topical signal either. Skipped symmetrically in the
// question and in KB text. Single characters below skip any bigram holding one.
const CJK_SKIP_CHARS = new Set([..."麼么啥嗎吗呢"]);
const CJK_SKIP = new Set(
  "為什 为什 什麼 什么 為何 为何 為啥 为啥 為甚 为甚 甚麼 如何 怎麼 怎么 怎樣 怎样 多少 哪裡 哪里 なぜ なに どう うし して いつ どこ だれ どれ です すか ます".split(" "),
);

// Bigrams holding one of these function characters are too generic to carry
// topical signal (X的Y genitives, modals like 會, aspect markers). Skipped
// symmetrically in the question and in KB text.
const FUNC_CHARS = new Set([..."的是在有和與或被把將用到了著過嗎呢啊吧呀們不沒會就也都這那"]);

const KB_DIRECT_THRESHOLD = 4;
const KB_FOLLOWUP_THRESHOLD = 4;
const KB_MARGIN = 6;
const KB_BONUS_EACH = 6;
const KB_BONUS_CAP = 12;

// Common words discriminate nothing: weight by how many KB title sets hold
// the term. A term in many titles (台北, "water") can corroborate but never
// elect on its own; the two-term rule below enforces that.
function termWeight(df: number): number {
  if (df <= 2) return 3;
  if (df <= 4) return 2;
  if (df <= 6) return 1;
  return 0.25;
}

// Plural-insensitive match on a shared stem. Deliberately narrow (exact or
// trailing s/es only): the old prefix rule matched "can't" to "can" and
// "Taiwan" to "Taiwanese".
function normWord(w: string): string {
  if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s")) return w.slice(0, -1);
  return w;
}

function wordMatch(a: string, b: string): boolean {
  if (a.length < 3 || b.length < 3) return false;
  return normWord(a) === normWord(b);
}

function foldText(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[぀-ヿ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

interface QToks {
  latin: string[];
  bigrams: string[];
  text: string;
}

function skipBigram(b: string): boolean {
  return [...b].some((ch) => CJK_SKIP_CHARS.has(ch) || FUNC_CHARS.has(ch)) || CJK_SKIP.has(b);
}

function tokenize(question: string): QToks {
  const text = foldText(question);
  const latin = (text.match(/[a-z0-9]+/g) ?? []).filter((w) => w.length >= 3 && !LATIN_STOP.has(w));
  const cjk = (text.match(/[ぁ-んァ-ヶ一-鿿]+/g) ?? []).join("");
  const bigrams: string[] = [];
  for (let i = 0; i + 1 < cjk.length; i++) {
    const b = cjk.slice(i, i + 2);
    if (skipBigram(b)) continue;
    bigrams.push(b);
  }
  return { latin, bigrams, text };
}

interface Prep {
  item: KnowledgeItem;
  titleWords: string[];
  factWords: Set<string>;
  titleBigrams: Set<string>;
  factBigrams: Set<string>;
  concepts: string[];
  conceptWords: string[];
  idTokens: string[];
}

function prepare(item: KnowledgeItem): Prep {
  const titles = Object.values(item.title ?? {});
  const facts = Object.values(item.fact ?? {});
  const titleText = foldText(titles.join(" "));
  const factText = foldText(facts.join(" "));
  const keepWord = (w: string) => w.length >= 3 && !LATIN_STOP.has(w);
  const words = (s: string) => s.match(/[a-z0-9]+/g) ?? [];
  const grams = (s: string) => {
    const cjk = (s.match(/[ぁ-んァ-ヶ一-鿿]+/g) ?? []).join("");
    const out = new Set<string>();
    for (let i = 0; i + 1 < cjk.length; i++) {
      const b = cjk.slice(i, i + 2);
      if (skipBigram(b)) continue;
      out.add(b);
    }
    return out;
  };
  const concepts = (item.trigger.photo_concepts ?? []).map((c) => foldText(c));
  return {
    item,
    titleWords: words(titleText).filter(keepWord).map(normWord),
    factWords: new Set(words(factText).filter(keepWord).map(normWord)),
    titleBigrams: grams(titleText),
    factBigrams: grams(factText),
    concepts,
    conceptWords: concepts.flatMap((c) => words(c).filter(keepWord).map(normWord)),
    idTokens: item.id.split(/[-_]/).map((t) => t.toLowerCase()),
  };
}

interface ItemScore {
  score: number;
  terms: Set<string>;
}

// Title, concept and id signals only; fact text never scores. Each matching
// question term counts once, attributed to the term itself, so one repeated
// generic word ("water" in two items) cannot elect anything alone.
function scoreItem(p: Prep, q: QToks, dfL: Map<string, number>, dfC: Map<string, number>): ItemScore {
  let s = 0;
  const terms = new Set<string>();
  const add = (term: string, v: number) => {
    if (v <= 0) return;
    s += v;
    terms.add(term);
  };
  for (const w of q.latin) {
    const key = `L:${w}`;
    if (p.titleWords.some((t) => wordMatch(t, w))) add(key, termWeight(dfL.get(normWord(w)) ?? 0));
    if (p.idTokens.some((t) => wordMatch(t, w))) add(key, 1);
  }
  for (const b of q.bigrams) {
    if (p.titleBigrams.has(b)) add(`C:${b}`, termWeight(dfC.get(b) ?? 0));
  }
  for (const c of p.concepts) {
    if (!c || !q.text.includes(c)) continue;
    add(`P:${c}`, 4);
    for (const w of p.conceptWords) {
      const hit = q.latin.find((qw) => wordMatch(w, qw));
      if (hit) add(`L:${hit}`, 1);
    }
  }
  return { score: s, terms };
}

// A facet-specific signal: a question term found in the facet but not in the
// parent, rare across the KB, and not a generic function word. Each is worth
// KB_BONUS_EACH, capped at KB_BONUS_CAP.
function facetBonus(f: Prep, p: Prep, q: QToks, dfL: Map<string, number>, dfC: Map<string, number>): { bonus: number; terms: Set<string> } {
  const terms = new Set<string>();
  let n = 0;
  for (const w of q.latin) {
    if (n >= 2) break;
    const nw = normWord(w);
    if (!f.titleWords.includes(nw) && !f.factWords.has(nw)) continue;
    if (p.titleWords.includes(nw) || p.factWords.has(nw)) continue;
    if ((dfL.get(nw) ?? 0) > 3) continue;
    n++;
    terms.add(`L:${w}`);
  }
  for (const b of q.bigrams) {
    if (n >= 2) break;
    if (skipBigram(b)) continue;
    if (!f.titleBigrams.has(b) && !f.factBigrams.has(b)) continue;
    if (p.titleBigrams.has(b) || p.factBigrams.has(b)) continue;
    if ((dfC.get(b) ?? 0) > 3) continue;
    n++;
    terms.add(`C:${b}`);
  }
  return { bonus: Math.min(n * KB_BONUS_EACH, KB_BONUS_CAP), terms };
}

// Document frequency over titles only: weights must reflect the same text
// that scores, or long fact texts inflate every count and flatten all
// weights. (Fact text still counts for facet-bonus rarity via the
// per-item fact sets on Prep.)
function docFreq(items: KnowledgeItem[]): { dfL: Map<string, number>; dfC: Map<string, number> } {
  const dfL = new Map<string, number>();
  const dfC = new Map<string, number>();
  for (const item of items) {
    const p = prepare(item);
    for (const w of new Set(p.titleWords)) dfL.set(w, (dfL.get(w) ?? 0) + 1);
    for (const b of new Set(p.titleBigrams)) dfC.set(b, (dfC.get(b) ?? 0) + 1);
  }
  return { dfL, dfC };
}

// A match needs both a score at threshold and at least two distinct question
// terms: one generic word ("water", "people", 台北) is never enough.
function confident(score: ItemScore, threshold: number): boolean {
  return score.score >= threshold && score.terms.size >= 2;
}

// Elect the parent or the most specific facet within one family: the parent
// wins unless a facet carries a facet-specific signal and strictly clears
// the margin above the parent.
function electFamily(
  q: QToks,
  preps: Map<string, Prep>,
  parentId: string,
  scores: Map<string, ItemScore>,
  threshold: number,
  dfL: Map<string, number>,
  dfC: Map<string, number>,
): { item: KnowledgeItem; score: ItemScore } | null {
  const p = preps.get(parentId);
  if (!p) return null;
  const pScore = scores.get(parentId) ?? { score: 0, terms: new Set<string>() };
  const facets = [...preps.values()].filter((c) => c.item.parent === parentId && confident(scores.get(c.item.id) ?? { score: 0, terms: new Set<string>() }, threshold));
  if (confident(pScore, threshold)) {
    let best = p.item;
    let bestScore = pScore;
    for (const f of facets) {
      const fScore = scores.get(f.item.id)!;
      const { bonus, terms } = facetBonus(f, p, q, dfL, dfC);
      const v: ItemScore = { score: fScore.score + bonus, terms: new Set([...fScore.terms, ...terms]) };
      if (bonus > 0 && v.score > pScore.score + KB_MARGIN && v.score > bestScore.score) {
        best = f.item;
        bestScore = v;
      }
    }
    return { item: best, score: bestScore };
  }
  let best: { item: KnowledgeItem; score: ItemScore } | null = null;
  for (const f of facets) {
    const fScore = scores.get(f.item.id)!;
    const { bonus, terms } = facetBonus(f, p, q, dfL, dfC);
    const v: ItemScore = { score: fScore.score + bonus, terms: new Set([...fScore.terms, ...terms]) };
    if (!best || v.score > best.score.score) best = { item: f.item, score: v };
  }
  return best;
}

function matchInScope(question: string, scope: KnowledgeItem[] | null, threshold: number): KnowledgeItem | null {
  const items = getKnowledgeItems();
  const q = tokenize(question);
  const preps = new Map(items.map((item) => [item.id, prepare(item)]));
  const { dfL, dfC } = docFreq(items);
  const scores = new Map(items.map((item) => [item.id, scoreItem(preps.get(item.id)!, q, dfL, dfC)]));
  const pool = scope ?? items;
  const ranked = pool
    .map((item) => ({ item, result: scores.get(item.id) ?? { score: 0, terms: new Set<string>() } }))
    .sort((a, b) => b.result.score - a.result.score || (a.item.parent ? 1 : 0) - (b.item.parent ? 1 : 0));
  const top = ranked[0];
  if (!top || !confident(top.result, threshold)) return null;
  if (scope && !top.item.parent) return top.item;
  const elected = electFamily(q, preps, top.item.parent ?? top.item.id, scores, threshold, dfL, dfC);
  if (!elected || !confident(elected.score, threshold)) return null;
  if (scope && !scope.some((s) => s.id === elected.item.id)) return null;
  return elected.item;
}

// Confident KB match for a standalone question, in any of the KB languages.
export function matchKbQuestion(question: string): KnowledgeItem | null {
  return matchInScope(question, null, KB_DIRECT_THRESHOLD);
}

// Follow-up match against the recent narrations: their items plus parents and
// facets, with a relaxed threshold. A bare "why?" falls back to the latest
// narrated item.
export function matchKbFollowUp(question: string, recent: Narration[]): KnowledgeItem | null {
  const ids: string[] = [];
  for (let i = recent.length - 1; i >= 0; i--) {
    const id = recent[i]?.itemId;
    if (id && !ids.includes(id)) ids.push(id);
  }
  if (!ids.length) return null;
  const items = getKnowledgeItems();
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const id of ids) {
    const item = byId.get(id);
    if (!item) continue;
    const parentId = item.parent ?? item.id;
    const scope = items.filter((it) => it.id === parentId || it.parent === parentId);
    if (!scope.length) continue;
    const hit = matchInScope(question, scope, KB_FOLLOWUP_THRESHOLD);
    if (hit) return hit;
  }
  const bare = question.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  if (bare.length <= 2 || ["why", "howcome", "為什麼", "为什么", "為啥", "为啥", "怎麼", "怎么", "如何", "為何", "为何", "なぜ", "なんで", "どうして"].includes(bare)) {
    return byId.get(ids[0]) ?? null;
  }
  return null;
}

const KbChoiceSchema = z.object({ itemId: z.string().nullable() });
type KbChoice = z.infer<typeof KbChoiceSchema>;

const KB_CHOICE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["itemId"],
  properties: { itemId: { type: ["string", "null"] } },
} as const;

// Compact candidate list for the model fallback: id plus English and zh-TW
// titles, with facet-to-parent links. No facts: the model only routes, the
// verified KB text does the talking.
function kbChoiceList(): string {
  return getKnowledgeItems()
    .map((item) => {
      const titles = [item.title.en, item.title["zh-TW"]].filter(Boolean).join(" / ");
      const fam = item.parent ? ` [facet of ${item.parent}]` : "";
      return `- ${item.id}: ${titles}${fam}`;
    })
    .join("\n");
}

// Real mode only: one short model call (no tools, no web search) mapping an
// uncertain question onto a KB topic. Returns null on any failure or when
// the model declines, so the caller falls through to web search.
async function modelKbChoice(question: string, recent: Narration[], trace: Trace): Promise<KnowledgeItem | null> {
  const recentCtx = recent
    .slice(-3)
    .map((n) => `- ${n.itemId ?? "none"}: ${n.title}`)
    .join("\n");
  try {
    const { text } = await responsesText({
      instructions:
        "You match a visitor's question to one knowledge-base topic. Reply with JSON only: " +
        '{"itemId": "<id>"} for the single topic the question is really asking about, or {"itemId": null} ' +
        "when the question is not about any listed topic (a practical question, small talk, or anything " +
        "you are unsure of). Prefer null over a guess. Answer in any of English, Traditional Chinese or " +
        "Japanese. A facet id only when the question asks about that facet's specific detail; " +
        "otherwise use the parent topic.",
      input: `Topics:\n${kbChoiceList()}\n\nRecent answers (for follow-ups like "why"):\n${recentCtx || "none"}\n\nQuestion: ${question}`,
      // Short, but roomy: reasoning tokens share this budget, and a starved
      // budget comes back as empty text (seen with 100).
      max_output_tokens: 1000,
      text: { format: { type: "json_schema", name: "kb_choice", strict: true, schema: KB_CHOICE_JSON_SCHEMA } },
    });
    const choice: KbChoice = parseModelJson(text, KbChoiceSchema);
    if (!choice.itemId) {
      trace.add("decision", "Model found no knowledge topic for this question; searching the web.");
      return null;
    }
    const item = getItem(choice.itemId);
    if (!item) {
      trace.add("error", `Model chose unknown item "${choice.itemId}"; searching the web.`);
      return null;
    }
    trace.add("decision", `Model matched knowledge item "${item.id}".`);
    return item;
  } catch (err) {
    trace.add("error", `Topic-match call failed (${err instanceof Error ? err.message.slice(0, 120) : "unknown error"}); searching the web.`);
    return null;
  }
}

export async function runAsk(req: AskRequest): Promise<AskResponse> {
  const trace = new Trace();
  const { profile, question } = req;
  trace.add("user", `Question (${profile.lang}): ${question.slice(0, 160)}`);
  const title = question.length > 40 ? `${question.slice(0, 40)}...` : question;

  // The verified knowledge base answers first, with or without a key.
  const direct = matchKbQuestion(question);
  if (direct) {
    trace.add("decision", `Matched knowledge item "${direct.id}" by keywords.`);
    return { narration: await answerFromItem(direct, profile, trace), trace: trace.steps };
  }
  const followUp = matchKbFollowUp(question, req.recent);
  if (followUp) {
    trace.add("decision", `Follow-up question: answering from "${followUp.id}" by keywords.`);
    return { narration: await answerFromItem(followUp, profile, trace), trace: trace.steps };
  }

  if (!isMockMode()) {
    const viaModel = await modelKbChoice(question, req.recent, trace);
    if (viaModel) {
      return { narration: await answerFromItem(viaModel, profile, trace), trace: trace.steps };
    }
  }

  if (isMockMode()) {
    trace.add("decision", "Nothing in the knowledge base matches; no web search in mock mode.");
    return { narration: noSource(profile, title, trace, "No source available in mock mode."), trace: trace.steps };
  }

  const recent = req.recent
    .slice(-3)
    .map((n) => `- ${n.title}: ${n.text}`)
    .join("\n");
  const where = req.fix ? `\nVisitor position: ${req.fix.lat.toFixed(4)}, ${req.fix.lon.toFixed(4)}` : "";
  const prompt = `${recent ? `What you just told the visitor:\n${recent}\n\n` : ""}Visitor question: ${question}${where}`;
  return { narration: await webAnswer({ profile, prompt, title, fix: req.fix, trace }), trace: trace.steps };
}

export async function runExplain(req: ExplainRequest): Promise<AskResponse> {
  const trace = new Trace();
  const { profile, label, itemId } = req;
  trace.add("user", `Tapped object: "${label}"${itemId ? ` (matched ${itemId})` : ""}.`);

  const item = itemId ? getItem(itemId) : undefined;
  if (item) {
    return { narration: await answerFromItem(item, profile, trace), trace: trace.steps };
  }
  if (itemId) trace.add("skip", `Item ${itemId} is not in the knowledge base.`);

  if (isMockMode()) {
    trace.add("decision", "Mock mode: no knowledge item and no web search.");
    return { narration: noSource(profile, label, trace, "No source available in mock mode."), trace: trace.steps };
  }
  const prompt = `The visitor tapped an object in a photo: "${label}". Explain what it is and why it is like this in this place, as an everyday thing, and compare with their hometown only if you can source it.`;
  return { narration: await webAnswer({ profile, prompt, title: label, fix: req.fix, trace }), trace: trace.steps };
}
