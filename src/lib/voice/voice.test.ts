import { afterEach, describe, expect, it } from "vitest";
import { buildTranscribeRequest, extractTranscript, isWav, parseKeywords, toTraditional, transcribe } from "./index";

describe("voice helpers", () => {
  it("parses keywords", () => {
    expect(parseKeywords(" 永康街, 東門 ,,")).toEqual(["永康街", "東門"]);
    expect(parseKeywords(null)).toEqual([]);
  });

  it("builds the request with language names", () => {
    const r = buildTranscribeRequest("zh-TW", ["東門"]);
    expect(r.languageBias).toEqual(["Mandarin Chinese"]);
    expect(r.keywords).toEqual(["東門"]);
    expect(buildTranscribeRequest("ja", []).languageBias).toEqual(["Japanese"]);
  });

  it("converts Simplified to Traditional (Taiwan)", () => {
    expect(toTraditional("这个软件为什么这么多")).toBe("這個軟體為什麼這麼多");
  });

  it("extracts transcripts from several shapes", () => {
    expect(extractTranscript({ text: " hi " })).toBe("hi");
    expect(extractTranscript({ turns: [{ text: "a" }, { text: "b" }] })).toBe("a b");
    expect(extractTranscript("plain")).toBe("plain");
    expect(extractTranscript(null)).toBe("");
  });

  it("detects WAV headers", () => {
    const b = new Uint8Array(64);
    b.set([...Buffer.from("RIFF")], 0);
    b.set([...Buffer.from("WAVE")], 8);
    expect(isWav(b)).toBe(true);
    expect(isWav(new Uint8Array(64))).toBe(false);
  });

  const saved = process.env.META_API_KEY;
  afterEach(() => {
    if (saved === undefined) delete process.env.META_API_KEY;
    else process.env.META_API_KEY = saved;
  });

  it("mock mode answers in the requested language", async () => {
    delete process.env.META_API_KEY;
    const ja = await transcribe(new Blob([new Uint8Array(4)]), "ja", []);
    expect(ja).toMatch(/バイク/);
    const en = await transcribe(new Blob([new Uint8Array(4)]), "en", []);
    expect(en).toMatch(/scooters/);
  });
});
