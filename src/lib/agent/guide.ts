import "server-only";
import { z } from "zod";
import { getItem } from "@/lib/kb";
import { isMockMode, openWeightClient } from "@/lib/meta/client";
import type { Candidate, GuideRequest, GuideResponse, KnowledgeItem, Lang, Narration } from "@/lib/types";
import { chatText, responsesText, type ChatBackend } from "./llm";
import { compass, composeFromItem, contrastFromItem, itemConfidence, itemSources, LANG_NAME, LENGTH_HINT, parseModelJson, pickText, Trace, usableComparison } from "./common";
import { loadPrompt } from "./prompts";

const MAX_CANDIDATES = 3;

const DecisionSchema = z.object({
  decision: z.enum(["speak", "silent"]),
  itemId: z.string(),
  title: z.string(),
  text: z.string(),
  here: z.string().default(""),
  elsewhere: z.string().default(""),
  reason: z.string(),
});
type Decision = z.infer<typeof DecisionSchema>;

const DECISION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["decision", "itemId", "title", "text", "here", "elsewhere", "reason"],
  properties: {
    decision: { type: "string", enum: ["speak", "silent"] },
    itemId: { type: "string" },
    title: { type: "string" },
    text: { type: "string" },
    here: { type: "string" },
    elsewhere: { type: "string" },
    reason: { type: "string" },
  },
} as const;

interface Ranked {
  cand: Candidate;
  item: KnowledgeItem;
}

function newId(): string {
  return `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function describeCandidate(r: Ranked, req: GuideRequest): string {
  const { item, cand } = r;
  const lang = req.profile.lang;
  const cmp = usableComparison(item, req.profile);
  const cmpText = cmp ? pickText(cmp.comparison, lang)?.text : null;
  return JSON.stringify({
    itemId: item.id,
    title: pickText(item.title, lang)?.text,
    fact: pickText(item.fact, lang)?.text,
    hometownComparison: cmpText ?? "none (do not compare)",
    disputed: item.disputed,
    caveats: item.caveats,
    sources: itemSources(item, req.profile).map((s) => s.publisher ?? s.title),
    distanceM: cand.distanceM,
    bearing: compass(cand.bearingDeg) || undefined,
    score: Number(cand.score.toFixed(2)),
    whyRanked: cand.reasons,
  });
}

function buildUserMessage(ranked: Ranked[], req: GuideRequest): string {
  return [
    `Visitor hometown: ${req.profile.hometown}`,
    `Visitor language: ${LANG_NAME[req.profile.lang]} (${req.profile.lang}). Length: ${LENGTH_HINT[req.profile.lang]}.`,
    `Area: ${req.areaName ?? "unknown"}`,
    `Candidates (best first):`,
    ...ranked.map((r, i) => `${i + 1}. ${describeCandidate(r, req)}`),
  ].join("\n");
}

function narrationFor(
  item: KnowledgeItem,
  req: GuideRequest,
  text: string,
  title: string,
  lang: Lang,
  contrast?: { here: string; elsewhere: string } | null,
): Narration {
  return {
    id: newId(),
    itemId: item.id,
    title,
    text,
    lang,
    sources: itemSources(item, req.profile),
    confidence: itemConfidence(item, req.profile),
    category: item.category,
    contrast: contrast === undefined ? contrastFromItem(item, req.profile, lang) : contrast,
  };
}

export async function runGuide(req: GuideRequest): Promise<GuideResponse> {
  const trace = new Trace();
  const { profile, fix } = req;
  const where = req.areaName ? `in ${req.areaName}` : "(area unknown)";
  trace.add("position", `At ${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)} ${where}${fix.simulated ? " (simulated walk)" : ""}.`);
  trace.add("user", `Visitor from ${profile.hometown}, language ${profile.lang}. Told so far: ${req.state.toldItemIds.length}.`);

  const told = new Set(req.state.toldItemIds);
  const ranked: Ranked[] = [];
  for (const cand of [...req.candidates].sort((a, b) => b.score - a.score)) {
    const item = getItem(cand.itemId);
    if (!item) {
      trace.add("skip", `Candidate ${cand.itemId} is not in the knowledge base; ignored.`);
      continue;
    }
    if (told.has(cand.itemId)) {
      trace.add("skip", `"${pickText(item.title, "en")?.text}" was already told; ignored.`);
      continue;
    }
    ranked.push({ cand, item });
  }

  if (ranked.length === 0) {
    trace.add("skip", "Nothing new worth telling here. Staying quiet.");
    return { narration: null, trace: trace.steps };
  }

  const top = ranked.slice(0, MAX_CANDIDATES);
  for (const r of top) {
    trace.add("candidate", `${pickText(r.item.title, "en")?.text} scored ${r.cand.score.toFixed(2)}: ${r.cand.reasons.join("; ") || "no reasons given"}.`, {
      itemId: r.item.id,
      score: r.cand.score,
    });
  }
  const fallback = top[0];

  const speakFallback = (why: string): GuideResponse => {
    const c = composeFromItem(fallback.item, profile);
    if (c.fellBack) trace.add("decision", `No ${LANG_NAME[profile.lang]} text for this item; using English instead.`);
    trace.add("decision", `Speaking "${c.title}": ${why}`);
    trace.add("verify", `Using ${itemSources(fallback.item, profile).length} pre-verified source(s) from the knowledge base.`);
    return { narration: narrationFor(fallback.item, req, c.text, c.title, c.lang), trace: trace.steps };
  };

  if (isMockMode()) {
    trace.add("decision", "Mock mode: no model call; choosing the top-ranked candidate.");
    return speakFallback("top-ranked candidate (mock mode).");
  }

  const system = await loadPrompt("guide-system.md");
  const user = buildUserMessage(top, req);
  const open = openWeightClient();

  // The model sometimes returns truncated or otherwise unparsable JSON (observed live:
  // "Unterminated string in JSON"). One immediate retry before falling back to canned text.
  let decision: Decision | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2 && !decision; attempt++) {
    try {
      if (open) {
        if (attempt === 0) trace.add("decision", `Narrating with the open-weight model ${open.model}.`);
        const raw = await chatText(
          open as unknown as ChatBackend,
          system,
          `${user}\n\nReply with a single JSON object with exactly these keys: decision, itemId, title, text, here, elsewhere, reason. JSON only, no code fences, no prose before or after. Keep text short enough to finish the object.`,
        );
        decision = parseModelJson(raw, DecisionSchema);
      } else {
        if (attempt === 0) trace.add("decision", "Asking the Meta model to choose and narrate.");
        const { text } = await responsesText({
          instructions: system,
          input: user,
          max_output_tokens: 2500,
          text: { format: { type: "json_schema", name: "guide_decision", strict: true, schema: DECISION_JSON_SCHEMA } },
        });
        decision = parseModelJson(text, DecisionSchema);
      }
    } catch (err) {
      lastError = err;
      if (attempt === 0) trace.add("error", `Model output could not be used (${err instanceof Error ? err.message.slice(0, 120) : "unknown error"}); retrying once.`);
    }
  }
  if (!decision) {
    trace.add("error", `Retry failed (${lastError instanceof Error ? lastError.message.slice(0, 120) : "unknown error"}); falling back to the top candidate.`);
    return speakFallback("fallback to the top-ranked candidate.");
  }

  if (decision.decision === "silent") {
    trace.add("decision", `Chose to stay quiet: ${decision.reason}`);
    return { narration: null, trace: trace.steps };
  }

  const picked = top.find((r) => r.item.id === decision.itemId);
  if (!picked) trace.add("error", `Model chose unknown item "${decision.itemId}"; using the top candidate.`);
  const chosen = picked ?? fallback;
  if (!decision.text.trim()) {
    trace.add("error", "Model returned empty narration; falling back to the knowledge base text.");
    return speakFallback("fallback to the top-ranked candidate.");
  }
  trace.add("decision", `Speaking "${decision.title}": ${decision.reason}`);
  trace.add("verify", `Facts come from the knowledge base; ${itemSources(chosen.item, profile).length} pre-verified source(s) attached.`);
  const title = decision.title.trim() || pickText(chosen.item.title, profile.lang)?.text || "";
  // Chips may only appear when the KB has a comparison, whatever the model wrote.
  const hasComparison = contrastFromItem(chosen.item, profile, profile.lang) !== null;
  const contrast =
    hasComparison && decision.here.trim() && decision.elsewhere.trim()
      ? { here: decision.here.trim(), elsewhere: decision.elsewhere.trim() }
      : undefined;
  return { narration: narrationFor(chosen.item, req, decision.text.trim(), title, profile.lang, contrast), trace: trace.steps };
}
