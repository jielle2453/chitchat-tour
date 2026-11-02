// Pure text helpers for subtitles.
import type { Lang } from "@/lib/types";

const HARD_END = "。！？";
const SOFT_END = ".!?";
const CLOSERS = "」』）)”\"'’";

// Split narration into sentences, keeping punctuation. "3.5" stays whole.
export function splitSentences(text: string): string[] {
  const chars = Array.from(text.replace(/\s+/g, " ").trim());
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    cur += c;
    const isHard = HARD_END.includes(c);
    const isSoft = SOFT_END.includes(c);
    if (!isHard && !isSoft) continue;
    // swallow repeated terminators and closing quotes
    let j = i + 1;
    while (j < chars.length && (HARD_END.includes(chars[j]) || SOFT_END.includes(chars[j]) || CLOSERS.includes(chars[j]))) {
      cur += chars[j];
      j++;
    }
    const next = chars[j];
    if (isHard || next === undefined || next === " ") {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    }
    i = j - 1;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const CJK = /[぀-ヿ㐀-鿿豈-﫿]/g;

// Rough spoken duration, used when the speech engine reports no timing.
export function estimateSpeechMs(text: string, _lang: Lang, rate = 1): number {
  const cjk = (text.match(CJK) ?? []).length;
  const latinWords = text.replace(CJK, " ").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  const pauses = (text.match(/[。！？.!?,、，]/g) ?? []).length;
  const ms = cjk * 230 + latinWords * 360 + pauses * 120;
  return Math.max(800, ms / Math.max(0.25, rate));
}

// Which sentence is being spoken at `fraction` (0..1) of the way through, weighted by length.
export function sentenceIndexAt(sentences: string[], fraction: number): number {
  if (sentences.length <= 1) return 0;
  const f = Math.min(1, Math.max(0, fraction));
  const weights = sentences.map((s) => Math.max(1, Array.from(s).length));
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < sentences.length; i++) {
    acc += weights[i];
    if (f * total < acc) return i;
  }
  return sentences.length - 1;
}
