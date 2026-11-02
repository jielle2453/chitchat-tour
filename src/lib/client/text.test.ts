import { describe, expect, it } from "vitest";
import { estimateSpeechMs, sentenceIndexAt, splitSentences } from "./text";

describe("splitSentences", () => {
  it("splits English on terminal punctuation followed by a space", () => {
    expect(splitSentences("It rains a lot. Umbrellas hang here! Why? Because.")).toEqual(["It rains a lot.", "Umbrellas hang here!", "Why?", "Because."]);
  });
  it("keeps decimals together", () => {
    expect(splitSentences("It is 3.5 metres tall. Really.")).toEqual(["It is 3.5 metres tall.", "Really."]);
  });
  it("splits Japanese and Chinese full stops without spaces", () => {
    expect(splitSentences("ここは雨が多い。傘立てがあります！本当？")).toEqual(["ここは雨が多い。", "傘立てがあります！", "本当？"]);
    expect(splitSentences("這裡常下雨。店門口會放傘架。")).toEqual(["這裡常下雨。", "店門口會放傘架。"]);
  });
  it("keeps closing quotes with their sentence", () => {
    expect(splitSentences("他說：「好。」然後走了。")).toEqual(["他說：「好。」", "然後走了。"]);
  });
  it("handles text without terminators and empty text", () => {
    expect(splitSentences("no end")).toEqual(["no end"]);
    expect(splitSentences("   ")).toEqual([]);
  });
});

describe("sentenceIndexAt", () => {
  const s = ["aaaa", "bb", "cccccc"];
  it("advances with the fraction, weighted by length", () => {
    expect(sentenceIndexAt(s, 0)).toBe(0);
    expect(sentenceIndexAt(s, 0.2)).toBe(0);
    expect(sentenceIndexAt(s, 0.4)).toBe(1);
    expect(sentenceIndexAt(s, 0.9)).toBe(2);
    expect(sentenceIndexAt(s, 1)).toBe(2);
  });
  it("clamps and handles a single sentence", () => {
    expect(sentenceIndexAt(s, -3)).toBe(0);
    expect(sentenceIndexAt(["x"], 0.7)).toBe(0);
  });
});

describe("estimateSpeechMs", () => {
  it("grows with text and shrinks with speed", () => {
    const short = estimateSpeechMs("Hello there.", "en");
    const long = estimateSpeechMs("Hello there. This is a much longer sentence about utility poles.", "en");
    expect(long).toBeGreaterThan(short);
    expect(estimateSpeechMs("Hello there.", "en", 2)).toBeLessThan(short);
  });
  it("counts CJK characters", () => {
    expect(estimateSpeechMs("這裡常下雨，所以店門口會放傘架。", "zh-TW")).toBeGreaterThan(2000);
  });
});
