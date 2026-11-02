// Localizes raw server trace lines (English) into calm UI-language timeline
// entries. Pure: regex maps of known message shapes to i18n templates, with
// coordinates hidden, noisy housekeeping lines dropped (null), and anything
// unknown passed through with coordinates stripped.
"use client";
import { t } from "./i18n";
import type { Lang, TraceKind, TraceStep } from "@/lib/types";

export type TraceGroup = "look" | "consider" | "research" | "check" | "speak" | "quiet" | "ask";

export interface LocalizedTrace {
  group: TraceGroup;
  text: string;
  detail?: string[];
  visual?: { kind: "sources"; total: number; kept: number } | { kind: "score"; score: number };
  /** web research still in progress: the panel shows subtle animated dots */
  live?: boolean;
}

export interface DisplayStep extends LocalizedTrace {
  at: number;
  age: string;
  count: number;
}

// Coordinate pairs never reach the UI.
const COORDS = /\s*(?:at\s*)?-?\d{1,3}\.\d{2,},\s*-?\d{1,3}\.\d{2,}/g;

function stripCoords(s: string): string {
  return s.replace(COORDS, "").replace(/\s{2,}/g, " ").trim();
}

function shortLangName(name: string, lang: Lang): string {
  const n = name.toLowerCase();
  const key = /japanese/.test(n) ? "traceLangJapanese" : /chinese/.test(n) ? "traceLangChinese" : "traceLangEnglish";
  return t(lang, key);
}

function ageText(age: string, lang: Lang): string {
  if (/just now/i.test(age)) return t(lang, "traceJustNow");
  const m = /(\d+)\s*min/i.exec(age);
  if (m) return t(lang, "traceMinAgo", { n: Number(m[1]) });
  return age;
}

function localizeReason(r: string, lang: Lang): string {
  const s = r.trim().replace(/\.+$/, "");
  let m = /^you (photographed|asked about) (.+?) ((?:just now)|(?:\d+ min ago)|(?:1 min ago))$/i.exec(s);
  if (m) {
    const key = m[1].toLowerCase() === "photographed" ? "tracePhotoBy" : "traceAskedBy";
    return t(lang, key, { concept: m[2], age: ageText(m[3], lang) });
  }
  const filler: Record<string, "traceFillerAreaQuiet" | "traceFillerAreaNothing" | "traceFillerNationalQuiet" | "traceFillerNationalNothing"> = {
    "quiet for a while, area fact": "traceFillerAreaQuiet",
    "nothing nearby, area fact": "traceFillerAreaNothing",
    "quiet for a while, national fact": "traceFillerNationalQuiet",
    "nothing nearby, national fact": "traceFillerNationalNothing",
  };
  if (filler[s]) return t(lang, filler[s]);
  m = /^(.+?) (\d+) m (ahead|nearby)$/.exec(s);
  if (m) {
    return t(lang, "tracePointAway", {
      label: m[1],
      d: Number(m[2]),
      dir: t(lang, m[3] === "ahead" ? "traceAheadDir" : "traceNearbyDir"),
    });
  }
  return s;
}

function unknownArea(lang: Lang): string {
  return t(lang, "unknownArea");
}

/** Map one raw step to a localized entry, or null when the line is hidden. */
export function localizeTrace(kind: TraceKind, message: string, lang: Lang): LocalizedTrace | null {
  const msg = message.trim();
  let m: RegExpMatchArray | null;

  // ---- housekeeping noise: never shown ----
  if (/^Visitor from .*, language .*\. Told so far: \d+\.?$/.test(msg)) return null;
  if (/^Hometown .*?, language \S+$/.test(msg)) return null;
  if (/^Shaped the (narration|answer) to spoken length in .*\.?$/.test(msg)) return null;
  if (/^Shaping step failed; using the unshaped text\.?$/.test(msg)) return null;
  if (/^Model output could not be used \(.*\); retrying once\.?$/.test(msg)) return null;
  if (/^Mock mode: no model call; using a canned narration for this kind of place\.?$/.test(msg)) return null;

  // ---- the walker did something ----
  m = /^Question \([^)]*\): (.*)$/.exec(msg);
  if (m) return { group: "ask", text: t(lang, "traceQuestion", { q: m[1].slice(0, 120) }) };
  m = /^Tapped object: "([^"]+)"(?: \(matched [^)]+\))?\.?$/.exec(msg);
  if (m) return { group: "ask", text: t(lang, "traceTapped", { label: m[1] }) };

  // ---- looking around ----
  m = /^At -?\d+\.\d+, -?\d+\.\d+ (.*)$/.exec(msg);
  if (m) {
    const rest = m[1];
    const area = /^in (.+?)( \(simulated walk\))?\.?\s*$/.exec(rest)?.[1] ?? (/\(area unknown\)/.test(rest) ? unknownArea(lang) : stripCoords(rest));
    return { group: "look", text: t(lang, "traceAround", { area }) };
  }
  m = /^(.+?): (\d+) places? within \d+ m$/.exec(msg);
  if (m) {
    const area = /^unknown area$/i.test(m[1]) ? unknownArea(lang) : m[1];
    return { group: "look", text: t(lang, "traceNearby", { area, n: Number(m[2]) }) };
  }
  m = /^Looking ahead: (\d+) places? within \d+ m to research\.?$/.exec(msg);
  if (m) return { group: "look", text: t(lang, "traceAhead", { n: Number(m[1]) }) };

  // ---- considering a candidate ----
  m = /^(.*) scored (\d+\.\d+): (.*)$/.exec(msg);
  if (!m) m = /^(.*) \(score (\d+\.\d+)\): (.*)$/.exec(msg);
  if (m) {
    const score = Number(m[2]);
    const reasons = m[3].split(/\s*;\s*/).filter(Boolean).map((r) => localizeReason(r, lang));
    return {
      group: "consider",
      text: t(lang, "traceConsidering", { title: m[1] }),
      detail: reasons.slice(0, 3),
      visual: { kind: "score", score },
    };
  }

  // ---- researching on the web ----
  m = /^Researching ahead: (.+?) \([^)]*\) at -?\d+\.\d+, -?\d+\.\d+\.?$/.exec(msg);
  if (m) return { group: "research", text: t(lang, "traceResearching", { name: m[1] }), live: true };
  m = /^Researching (.+?)…$/.exec(msg);
  if (m) return { group: "research", text: t(lang, "traceResearching", { name: m[1] }), live: true };
  m = /^Not in the knowledge base: researching "([^"]+)" on the web\.?$/.exec(msg);
  if (m) return { group: "research", text: t(lang, "traceWebSearch", { name: m[1] }), live: true };
  if (/^Not in the knowledge base: searching the web\.?$/.test(msg)) {
    return { group: "research", text: t(lang, "traceWebSearchShort"), live: true };
  }
  if (/^(Narrating with the open-weight model .*|Asking the Meta model to choose and narrate)\.?$/.test(msg)) {
    return { group: "research", text: t(lang, "traceAskModel"), live: true };
  }

  // ---- checking sources ----
  m = /^(\d+) page\(s\) read; (\d+) from trusted domains; the model relied on (\d+)\.?$/.exec(msg);
  if (m) {
    const total = Number(m[1]);
    const kept = Number(m[2]);
    return {
      group: "check",
      text: t(lang, "traceSources", { total, kept }),
      visual: { kind: "sources", total, kept },
    };
  }
  m = /^(?:Using (\d+) pre-verified source\(s\) from the knowledge base|Facts come from the knowledge base; (\d+) pre-verified source\(s\) attached|Answered from the verified knowledge base with (\d+) source\(s\); no web search needed)\.?$/.exec(msg);
  if (m) {
    const n = Number(m[1] ?? m[2] ?? m[3]);
    return { group: "check", text: t(lang, "traceKbSources", { n }) };
  }
  m = /^Mock mode: matched knowledge item "([^"]+)"\.?$/.exec(msg);
  if (m) return { group: "check", text: t(lang, "traceKbMatch", { title: m[1] }) };

  // ---- decided: speak ----
  m = /^Ready: "([^"]+)" — for when the walker gets there\.?$/.exec(msg);
  if (m) return { group: "speak", text: t(lang, "traceReady", { title: m[1] }) };
  m = /^Ready for when you get there: (.+?)\.?$/.exec(msg);
  if (m) return { group: "speak", text: t(lang, "traceReady", { title: m[1] }) };
  m = /^Telling you about (.+?) as you arrive\.?$/.exec(msg);
  if (m) return { group: "speak", text: t(lang, "traceArriving", { title: m[1] }) };
  m = /^Speaking "([^"]+)": .*$/.exec(msg);
  if (m) return { group: "speak", text: t(lang, "traceSpeaking", { title: m[1] }) };
  if (/^Mock mode: no model call; choosing the top-ranked candidate\.?$/.test(msg)) {
    return { group: "consider", text: t(lang, "traceChoosing") };
  }

  // ---- decided: stay quiet ----
  m = /^Chose to stay quiet: (.*)$/.exec(msg);
  if (m) return { group: "quiet", text: t(lang, "traceQuiet", { reason: m[1].slice(0, 140) }) };
  if (/^(Nothing new worth telling here\. Staying quiet|Nothing nearby is worth telling this walker right now|Mock mode: no canned narration for this kind of place; staying quiet)\.?$/.test(msg)) {
    return { group: "quiet", text: t(lang, "traceNothingNew") };
  }
  if (
    /^(No reliable source for this place; staying quiet|Nothing reliable to say about this place|The model found no reliable source( for this place)?|No citation from a trusted domain; will not state unsourced facts|No answer could be sourced|No source available in mock mode|Saying honestly that no reliable source was found|Mock mode: nothing in the knowledge base matches; no web search|Mock mode: no knowledge item and no web search)\.?$/.test(
      msg,
    )
  ) {
    return { group: "quiet", text: t(lang, "traceNoSource") };
  }
  m = /^"([^"]+)" was already told; ignored\.?$/.exec(msg);
  if (m) return { group: "quiet", text: t(lang, "traceAlreadyTold", { title: m[1] }) };
  m = /^"([^"]+)" is already covered by the knowledge base \("[^"]*"\); the KB handles it\.?$/.exec(msg);
  if (m) return { group: "quiet", text: t(lang, "traceAlreadyCovered", { name: m[1] }) };
  if (/^(Candidate \S+ is not in the knowledge base; ignored|Item \S+ is not in the knowledge base)\.?$/.test(msg)) {
    return { group: "quiet", text: t(lang, "traceSkipped") };
  }
  if (/^Live research budget used up for this walk \(\d+\); the knowledge base carries on\.?$/.test(msg)) {
    return { group: "quiet", text: t(lang, "traceBudgetDone") };
  }
  m = /^Research on (.+?) failed \(.*\)\.?$/.exec(msg);
  if (m) return { group: "quiet", text: t(lang, "traceResearchFailed", { label: m[1] }) };
  if (/^(Research call failed \(.*\)|Web search call failed \(.*\))\.?$/.test(msg)) {
    return { group: "quiet", text: t(lang, "traceWebFailed") };
  }
  if (/^(Retry failed \(.*\); falling back to the top candidate|Model chose unknown item "[^"]*"; using the top candidate|Model returned empty narration; falling back to the knowledge base text)\.?$/.test(msg)) {
    return { group: "quiet", text: t(lang, "traceBackup") };
  }
  m = /^No (.+?) text for this (?:item|place); using English instead\.?$/.exec(msg);
  if (m) return { group: "quiet", text: t(lang, "traceNoLang", { lang: shortLangName(m[1], lang) }) };

  // ---- fallback: raw text, coordinates hidden, styled by kind ----
  const fallbackGroup: Record<TraceKind, TraceGroup> = {
    position: "look",
    user: "ask",
    candidate: "consider",
    skip: "quiet",
    verify: "check",
    decision: "quiet",
    error: "quiet",
  };
  if (kind === "user") return null;
  return { group: fallbackGroup[kind], text: stripCoords(msg).slice(0, 200) };
}

/** Relative time for a step: "just now", "2 min", "1 hr". */
export function relAge(at: number, nowMs: number, lang: Lang): string {
  const s = Math.max(0, Math.round((nowMs - at) / 1000));
  if (s < 45) return t(lang, "traceJustNow");
  const mins = Math.round(s / 60);
  if (mins < 60) return t(lang, "traceMinAgo", { n: mins });
  return t(lang, "traceHrAgo", { n: Math.max(1, Math.round(mins / 60)) });
}

const MAX_STEPS = 60;

/**
 * Localize, drop hidden lines, collapse consecutive identical entries
 * (newest keeps the time, shows ×N), newest first.
 */
export function prepareTrace(steps: TraceStep[], lang: Lang, nowMs: number): DisplayStep[] {
  const out: DisplayStep[] = [];
  for (const s of steps.slice(-MAX_STEPS)) {
    const loc = localizeTrace(s.kind, s.message, lang);
    if (!loc) continue;
    const key = `${loc.group} | ${loc.text} | ${(loc.detail ?? []).join(";")}`;
    const prev = out[out.length - 1];
    if (prev && `${prev.group} | ${prev.text} | ${(prev.detail ?? []).join(";")}` === key) {
      prev.count += 1;
      prev.at = s.at;
      prev.age = relAge(s.at, nowMs, lang);
    } else {
      out.push({ ...loc, at: s.at, age: relAge(s.at, nowMs, lang), count: 1 });
    }
  }
  return out.reverse();
}
