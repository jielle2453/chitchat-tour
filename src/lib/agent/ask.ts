import "server-only";
import { getItem, getKnowledgeItems } from "@/lib/kb";
import { isMockMode } from "@/lib/meta/client";
import type { AskRequest, AskResponse, ExplainRequest, GeoFix, KnowledgeItem, Lang, Narration, Source, UserProfile } from "@/lib/types";
import { extractCitations, trustedSources } from "@/lib/verify";
import { composeFromItem, itemConfidence, itemSources, LANG_NAME, LENGTH_HINT, MSG, pickText, Trace } from "./common";
import { MAX_TOOL_CALLS } from "./guard";
import { responsesText } from "./llm";
import { loadPrompt } from "./prompts";

function newId(): string {
  return `a_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function tooLong(text: string, lang: Lang): boolean {
  return lang === "en" ? text.split(/\s+/).length > 180 : text.length > 320;
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

  trace.add("decision", "Not in the knowledge base: searching the web.");
  let text: string;
  let sources: Source[];
  try {
    const { text: out, raw } = await responsesText({
      instructions: `${system}\n\nAnswer in ${LANG_NAME[profile.lang]}, ${LENGTH_HINT[profile.lang]}. The visitor's hometown is ${profile.hometown}.`,
      input: prompt,
      tools: [tool],
      max_tool_calls: MAX_TOOL_CALLS,
      max_output_tokens: 1500,
    });
    text = out;
    const citations = extractCitations(raw);
    sources = trustedSources(citations);
    trace.add("verify", `${citations.length} citation(s) found; ${sources.length} from trusted domains.`, {
      kept: sources.map((s) => s.url),
      dropped: citations.filter((c) => !sources.some((s) => s.url === c.url)).map((c) => c.url),
    });
  } catch (err) {
    trace.add("error", `Web search call failed (${err instanceof Error ? err.message.slice(0, 120) : "unknown error"}).`);
    return noSource(profile, title, trace, "No answer could be sourced.");
  }

  if (!text || sources.length === 0) return noSource(profile, title, trace, "No citation from a trusted domain; will not state unsourced facts.");
  if (tooLong(text, profile.lang)) text = await shape(text, profile.lang, trace);
  return { id: newId(), itemId: null, title, text, lang: profile.lang, sources, confidence: "medium" };
}

// Crude keyword match so mock mode (and nothing else) can answer from the KB.
function matchKb(question: string): KnowledgeItem | null {
  const q = question.toLowerCase();
  const words = new Set(q.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4));
  const cjk = q.replace(/[^぀-ヿ一-鿿]/g, "");
  const bigrams = new Set<string>();
  for (let i = 0; i + 1 < cjk.length; i++) bigrams.add(cjk.slice(i, i + 2));
  let best: { item: KnowledgeItem; score: number } | null = null;
  for (const item of getKnowledgeItems()) {
    const hay = [...Object.values(item.title), ...Object.values(item.fact), ...(item.trigger.photo_concepts ?? [])].join(" ").toLowerCase();
    let score = 0;
    for (const w of words) if (hay.includes(w)) score += 1;
    for (const b of bigrams) if (hay.includes(b)) score += 0.5;
    for (const c of item.trigger.photo_concepts ?? []) if (q.includes(c.toLowerCase())) score += 2;
    if (!best || score > best.score) best = { item, score };
  }
  return best && best.score >= 2 ? best.item : null;
}

export async function runAsk(req: AskRequest): Promise<AskResponse> {
  const trace = new Trace();
  const { profile, question } = req;
  trace.add("user", `Question (${profile.lang}): ${question.slice(0, 160)}`);
  const title = question.length > 40 ? `${question.slice(0, 40)}...` : question;

  if (isMockMode()) {
    const item = matchKb(question);
    if (item) {
      trace.add("decision", `Mock mode: matched knowledge item "${pickText(item.title, "en")?.text}".`);
      return { narration: await answerFromItem(item, profile, trace), trace: trace.steps };
    }
    trace.add("decision", "Mock mode: nothing in the knowledge base matches; no web search.");
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
